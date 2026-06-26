import { StateManager } from './StateManager';
import { loadSessionData, saveSessionData, type PersistedSessionData, type PersistedSession } from './SessionPersistence';

// ===== Session Registry =====
// Manages multiple game sessions, supporting room-code-based lookup for multiplayer.

interface SessionEntry {
  stateManager: StateManager;
  code: string;
  createdAt: number;
  hostPlayerId?: string;  // The player who created the room
}

export class SessionRegistry {
  private sessions: Map<string, SessionEntry>;
  private codeToSessionId: Map<string, string>;
  private defaultSessionId: string | null;
  // Debounce timer for auto-save
  private saveTimer: ReturnType<typeof setTimeout> | null;
  private dirtySessions: Set<string>;

  constructor() {
    this.sessions = new Map();
    this.codeToSessionId = new Map();
    this.defaultSessionId = null;
    this.saveTimer = null;
    this.dirtySessions = new Set();
  }

  /**
   * Create a new session with a unique room code
   */
  createSession(hostPlayerId?: string): { sessionId: string; code: string; stateManager: StateManager } {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const code = this.generateCode();
    const stateManager = new StateManager(sessionId);

    stateManager.setSessionCode(code);

    const entry: SessionEntry = {
      stateManager,
      code,
      createdAt: Date.now(),
      hostPlayerId,
    };

    this.sessions.set(sessionId, entry);
    this.codeToSessionId.set(code, sessionId);

    // First session becomes the default
    if (!this.defaultSessionId) {
      this.defaultSessionId = sessionId;
    }

    console.log(`[SessionRegistry] Created session ${sessionId} with code ${code}`);
    return { sessionId, code, stateManager };
  }

  /**
   * Create a session from persisted data (restored on server restart)
   */
  createSessionFromPersisted(data: PersistedSession): StateManager {
    const { sessionId, code } = data;
    const stateManager = new StateManager(sessionId);

    // Restore all persisted state
    stateManager.loadFromPersisted(data);
    stateManager.setSessionCode(code);

    const entry: SessionEntry = {
      stateManager,
      code,
      createdAt: data.createdAt || Date.now(),
      hostPlayerId: data.hostPlayerId,
    };

    this.sessions.set(sessionId, entry);
    this.codeToSessionId.set(code, sessionId);

    // First restored session becomes default
    if (!this.defaultSessionId) {
      this.defaultSessionId = sessionId;
    }

    console.log(`[SessionRegistry] Restored session ${sessionId} with code ${code}`);
    return stateManager;
  }

  /**
   * Find a session by its room code
   */
  findByCode(code: string): StateManager | null {
    const sessionId = this.codeToSessionId.get(code.toUpperCase());
    if (!sessionId) return null;

    const entry = this.sessions.get(sessionId);
    return entry?.stateManager ?? null;
  }

  /**
   * Find a session by its session ID
   */
  findById(sessionId: string): StateManager | null {
    const entry = this.sessions.get(sessionId);
    return entry?.stateManager ?? null;
  }

  /**
   * Find a session that contains a specific playerId
   */
  findByPlayerId(playerId: string): StateManager | null {
    for (const entry of this.sessions.values()) {
      const players = entry.stateManager.getPlayers();
      if (players.find(p => p.id === playerId)) {
        return entry.stateManager;
      }
    }
    return null;
  }

  /**
   * Get session info by code
   */
  getSessionInfoByCode(code: string): { sessionId: string; code: string; playerCount: number; status: string } | null {
    const sessionId = this.codeToSessionId.get(code.toUpperCase());
    if (!sessionId) return null;

    const entry = this.sessions.get(sessionId);
    if (!entry) return null;

    const state = entry.stateManager.getState();
    return {
      sessionId,
      code: entry.code,
      playerCount: state.players.length,
      status: state.status,
    };
  }

  /**
   * Get the host player ID for a session
   */
  getHostId(sessionId: string): string | undefined {
    const entry = this.sessions.get(sessionId);
    return entry?.hostPlayerId;
  }

  /**
   * Set the host player ID for a session
   */
  setHostId(sessionId: string, playerId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.hostPlayerId = playerId;
    }
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      this.codeToSessionId.delete(entry.code);
      this.sessions.delete(sessionId);
      console.log(`[SessionRegistry] Removed session ${sessionId}`);
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Array<{ sessionId: string; code: string; playerCount: number; status: string }> {
    return Array.from(this.sessions.entries()).map(([sessionId, entry]) => {
      const state = entry.stateManager.getState();
      return {
        sessionId,
        code: entry.code,
        playerCount: state.players.length,
        status: state.status,
      };
    });
  }

  /**
   * Get all sessions with detailed info (players, scene) for client listing
   */
  getAllSessionsDetailed(): Array<{
    sessionId: string;
    code: string;
    status: string;
    players: Array<{ id: string; name: string; characterName?: string; isConnected: boolean }>;
    createdAt: number;
    currentSceneName: string;
  }> {
    return Array.from(this.sessions.entries()).map(([sessionId, entry]) => {
      const state = entry.stateManager.getState();
      return {
        sessionId,
        code: entry.code,
        status: state.status,
        players: state.players.map(p => ({
          id: p.id,
          name: p.name,
          characterName: p.character?.name,
          isConnected: p.isConnected,
        })),
        createdAt: entry.createdAt,
        currentSceneName: state.currentScene.name,
      };
    });
  }

  /**
   * Generate a 6-character room code
   * Excludes easily confused characters: 0/O, 1/I/l
   */
  generateCode(): string {
    // Allowed characters: A-Z (excluding I, O) + 2-9
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    let attempts = 0;

    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      attempts++;
    } while (this.codeToSessionId.has(code) && attempts < 100);

    if (attempts >= 100) {
      // Extremely unlikely, but handle it
      code = Date.now().toString(36).toUpperCase().slice(-6);
    }

    return code;
  }

  // ===== Persistence =====

  /**
   * Get the default session ID
   */
  getDefaultSessionId(): string | null {
    return this.defaultSessionId;
  }

  /**
   * Mark a session as dirty (needs saving). Triggers debounced auto-save.
   */
  markDirty(sessionId: string): void {
    this.dirtySessions.add(sessionId);
    this.scheduleSave();
  }

  /**
   * Save a single session's state immediately
   */
  persistSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    const persisted = entry.stateManager.toPersisted(entry.code);
    persisted.hostPlayerId = entry.hostPlayerId;
    // Read current file, update this session, write back
    const current = this.loadCurrentData();
    current.sessions[sessionId] = persisted;
    saveSessionData(current);
  }

  /**
   * Save all sessions to file immediately
   */
  persistAll(): void {
    const data: PersistedSessionData = {
      version: 1,
      defaultSessionId: this.defaultSessionId || '',
      sessions: {},
    };

    for (const [sessionId, entry] of this.sessions) {
      const persisted = entry.stateManager.toPersisted(entry.code);
      persisted.hostPlayerId = entry.hostPlayerId;
      data.sessions[sessionId] = persisted;
    }

    saveSessionData(data);
    this.dirtySessions.clear();
  }

  /**
   * Schedule a debounced save (2s after last change)
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.flushDirtySessions();
      this.saveTimer = null;
    }, 2000);
  }

  /**
   * Save only the dirty sessions
   */
  private flushDirtySessions(): void {
    if (this.dirtySessions.size === 0) return;

    const current = this.loadCurrentData();

    for (const sessionId of this.dirtySessions) {
      const entry = this.sessions.get(sessionId);
      if (entry) {
        const persisted = entry.stateManager.toPersisted(entry.code);
        persisted.hostPlayerId = entry.hostPlayerId;
        current.sessions[sessionId] = persisted;
      }
    }

    // Update defaultSessionId
    current.defaultSessionId = this.defaultSessionId || '';

    saveSessionData(current);
    this.dirtySessions.clear();
  }

  /**
   * Load current data file without throwing, returns empty structure if not found
   */
  private loadCurrentData(): PersistedSessionData {
    const loaded = loadSessionData();
    return loaded || {
      version: 1,
      defaultSessionId: this.defaultSessionId || '',
      sessions: {},
    };
  }
}
