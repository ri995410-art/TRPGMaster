import type {
  SessionState,
  SessionZeroData,
  SessionZeroPhase,
  SceneState,
  CombatState,
  CombatEnemy,
  TimelineEntry,
  GameEvent,
  GameEventType,
  CampaignState,
  Player,
  SpotlightState,
  SafetyState,
} from '@trpgmaster/shared';
import { getTier } from '@trpgmaster/shared';
import type { Character } from '@trpgmaster/shared';
import type { PersistedSession, PersistedAdventureMessage } from './SessionPersistence';

export class StateManager {
  private state: SessionState;
  private listeners: Map<string, Set<(state: SessionState) => void>>;
  private dirtyFlags: Set<string>;
  // Adventure messages — stored server-side for persistence
  private adventureMessages: PersistedAdventureMessage[];

  constructor(sessionId: string) {
    this.state = this.createInitialState(sessionId);
    this.listeners = new Map();
    this.dirtyFlags = new Set();
    this.adventureMessages = [];
  }

  private createInitialState(sessionId: string): SessionState {
    return {
      sessionId,
      status: 'setup',
      character: null as unknown as Character, // Set during character creation (backward compat)
      characters: [],                           // Multi-player character list
      players: [],                              // Multi-player player list
      currentScene: {
        id: 'initial',
        name: '开场',
        description: '',
        environment: '',
        activeConditions: [],
        npcPresent: [],
        enemies: [],
        countdowns: [],
      },
      fearPoints: 0,
      totalFearGained: 0,
      totalFearSpent: 0,
      timeline: [],
      shortRestsSinceLong: 0,
      campaignState: this.createInitialCampaignState(),
    };
  }

  private createInitialCampaignState(): CampaignState {
    return {
      campaignId: 'drakkenheim',
      currentLocation: 'emberVillage',
      visitedLocations: [],
      factionRelations: {},
      personalQuestProgress: {},
      factionQuestProgress: {},
      contaminationLevel: 0,
      deleriumCollected: 0,
      sealsFound: [],
      currentChapter: 'arrival',
      hazeExpansion: 0,
      narrativeFlags: {},
    };
  }

  // ===== State Access =====

  getState(): SessionState {
    return JSON.parse(JSON.stringify(this.state));
  }

  getCharacter(): Character {
    return this.state.character;
  }

  // ===== Multi-player Management =====

  addPlayer(player: Player): void {
    // Check if player already exists
    const existing = this.state.players.find(p => p.id === player.id);
    if (existing) {
      // Update existing player
      existing.isConnected = true;
      existing.character = player.character;
      existing.name = player.name;
    } else {
      this.state.players.push({ ...player });
      this.state.characters.push({ ...player.character });
    }
    // Sync backward-compat character (first player's character)
    if (this.state.players.length > 0 && this.state.players[0].character) {
      this.state.character = this.state.players[0].character;
    }
    this.markDirty('players');
  }

  removePlayer(playerId: string): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    player.isConnected = false;
    // Keep the player in the list but mark as disconnected
    // (character data is preserved for when they reconnect)
    this.markDirty('players');
  }

  getPlayerCharacter(playerId: string): Character | undefined {
    const player = this.state.players.find(p => p.id === playerId);
    return player?.character;
  }

  updatePlayerCharacter(playerId: string, updates: Partial<Character>): void {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    Object.assign(player.character, updates);

    // Also update in characters array
    const charIndex = this.state.characters.findIndex(c => c.id === player.character.id);
    if (charIndex >= 0) {
      this.state.characters[charIndex] = { ...player.character };
    }

    // Sync backward compat
    if (this.state.players[0]?.id === playerId) {
      this.state.character = { ...player.character };
    }

    this.markDirty('character');
  }

  getPlayers(): Player[] {
    return this.state.players;
  }

  getConnectedPlayers(): Player[] {
    return this.state.players.filter(p => p.isConnected);
  }

  setSessionCode(code: string): void {
    this.state.sessionCode = code;
    this.markDirty('session');
  }

  // ===== Session Management =====

  startSession(): void {
    const connectedPlayers = this.state.players.filter(p => p.isConnected);
    if (connectedPlayers.length > 1) {
      this.state.status = 'sessionZero';
      this.state.sessionZeroPhase = 'safety';
      this.state.sessionZeroData = {};
      // Initialize spotlight for multi-player
      if (!this.state.spotlightState) {
        this.state.spotlightState = { mode: 'freeform', current: null, queue: [] };
      }
      // Initialize safety state for multi-player
      if (!this.state.safetyState) {
        this.state.safetyState = { phase: 's0', lines: [], veils: [], toneFlags: [], xcardActive: false };
      }
    } else {
      this.state.status = 'active';
    }
    this.markDirty('session');
  }

  completeSessionZero(): void {
    this.state.status = 'active';
    this.state.sessionZeroPhase = undefined;
    this.markDirty('session');
  }

  setSessionZeroPhase(phase: SessionZeroPhase): void {
    this.state.sessionZeroPhase = phase;
    this.markDirty('session');
  }

  updateSessionZeroData(data: Partial<SessionZeroData>): void {
    this.state.sessionZeroData = { ...this.state.sessionZeroData, ...data };
    this.markDirty('session');
  }

  pauseSession(): void {
    this.state.status = 'paused';
    this.markDirty('session');
  }

  resumeSession(): void {
    this.state.status = 'active';
    this.markDirty('session');
  }

  endSession(): void {
    this.state.status = 'ended';
    this.markDirty('session');
  }

  // ===== Character Management =====

  setCharacter(character: Character): void {
    this.state.character = { ...character };
    // If no players yet, this is single-player mode — sync characters array
    if (this.state.players.length === 0) {
      const existingIdx = this.state.characters.findIndex(c => c.id === character.id);
      if (existingIdx >= 0) {
        this.state.characters[existingIdx] = { ...character };
      } else {
        this.state.characters.push({ ...character });
      }
    }
    this.markDirty('character');
  }

  updateCharacterHp(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.hp = Math.max(0, Math.min(char.maxHp, char.hp + delta));
    this.markDirty('character');
    return true;
  }

  updateCharacterStress(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    const newStress = char.stress + delta;
    // If stress would overflow max, mark HP instead
    if (newStress > char.maxStress) {
      const overflow = newStress - char.maxStress;
      char.stress = char.maxStress;
      char.hp = Math.max(0, char.hp - overflow);
    } else {
      char.stress = Math.max(0, newStress);
    }
    this.markDirty('character');
    return true;
  }

  updateCharacterHope(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.hope = Math.max(0, Math.min(char.maxHope, char.hope + delta));
    this.markDirty('character');
    return true;
  }

  updateCharacterArmorSlots(used: boolean): boolean {
    const char = this.state.character;
    if (!char) return false;

    if (used && char.armorSlots > 0) {
      char.armorSlots -= 1;
    } else if (!used && char.armorSlots < char.maxArmorSlots) {
      char.armorSlots += 1;
    }
    this.markDirty('character');
    return true;
  }

  /** Adjust armor slots by numeric delta (negative = spend, positive = recover), clamped to [0, maxArmorSlots] */
  adjustCharacterArmorSlots(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.armorSlots = Math.max(0, Math.min(char.maxArmorSlots, char.armorSlots + delta));
    this.markDirty('character');
    return true;
  }

  updateCharacter(updates: Partial<Character>): boolean {
    const char = this.state.character;
    if (!char) return false;

    Object.assign(char, updates);
    this.markDirty('character');
    return true;
  }

  // ===== Spotlight / Turn Management =====

  getSpotlightState(): SpotlightState | undefined {
    return this.state.spotlightState;
  }

  setSpotlightState(spotlight: SpotlightState): void {
    this.state.spotlightState = spotlight;
    this.markDirty('spotlight');
  }

  // ===== Safety Tools =====

  getSafetyState(): SafetyState | undefined {
    return this.state.safetyState;
  }

  setSafetyState(safety: SafetyState): void {
    this.state.safetyState = safety;
    this.markDirty('safety');
  }

  // ===== GM Resources =====

  addFearPoints(points: number): void {
    this.state.fearPoints += points;
    this.state.totalFearGained += points;
    this.markDirty('fearPoints');
  }

  spendFearPoints(points: number): boolean {
    if (this.state.fearPoints < points) return false;
    this.state.fearPoints -= points;
    this.state.totalFearSpent += points;
    this.markDirty('fearPoints');
    return true;
  }

  // ===== Scene Management =====

  setCurrentScene(scene: SceneState): void {
    this.state.currentScene = scene;
    this.markDirty('scene');
  }

  // ===== Combat Management =====

  startCombat(enemies: CombatEnemy[]): void {
    this.state.activeCombat = {
      id: `combat_${Date.now()}`,
      round: 1,
      enemies,
      activeConditions: [],
      fearPointsUsed: 0,
    };
    this.markDirty('combat');
  }

  endCombat(): void {
    this.state.activeCombat = undefined;
    this.markDirty('combat');
  }

  getCombatState(): CombatState | undefined {
    return this.state.activeCombat;
  }

  updateCombatEnemyHp(enemyId: string, delta: number): boolean {
    const combat = this.state.activeCombat;
    if (!combat) return false;

    const enemy = combat.enemies.find(e => e.id === enemyId);
    if (!enemy) return false;

    enemy.currentHp = Math.max(0, Math.min(enemy.maxHp, enemy.currentHp + delta));
    if (enemy.currentHp === 0) {
      // Mark enemy as defeated — remove from active combat
      combat.enemies = combat.enemies.filter(e => e.id !== enemyId);
    }
    this.markDirty('combat');
    return true;
  }

  removeCombatEnemy(enemyId: string): boolean {
    const combat = this.state.activeCombat;
    if (!combat) return false;

    combat.enemies = combat.enemies.filter(e => e.id !== enemyId);
    this.markDirty('combat');
    return true;
  }

  // ===== Timeline =====

  addTimelineEntry(entry: TimelineEntry): void {
    this.state.timeline.push(entry);
    this.markDirty('timeline');
  }

  getTimelineSince(timestamp: number): TimelineEntry[] {
    return this.state.timeline.filter(e => e.timestamp >= timestamp);
  }

  getKeyMoments(): TimelineEntry[] {
    return this.state.timeline.filter(e => e.isKeyMoment);
  }

  // ===== Rest Tracking =====

  getShortRestsSinceLong(): number {
    return this.state.shortRestsSinceLong;
  }

  incrementShortRests(): void {
    this.state.shortRestsSinceLong++;
    this.markDirty('rests');
  }

  resetShortRests(): void {
    this.state.shortRestsSinceLong = 0;
    this.markDirty('rests');
  }

  // ===== Campaign State =====

  getCampaignState(): CampaignState {
    return this.state.campaignState;
  }

  updateCampaignState(updates: Partial<CampaignState>): void {
    Object.assign(this.state.campaignState, updates);
    this.markDirty('campaign');
  }

  updateFactionRelation(factionId: string, change: number): void {
    const current = this.state.campaignState.factionRelations[factionId] || 5;
    this.state.campaignState.factionRelations[factionId] = Math.max(1, Math.min(10, current + change));
    this.markDirty('campaign');
  }

  // ===== Tension Level =====

  getTensionLevel(): 'low' | 'medium' | 'high' | 'critical' {
    const score = this.state.totalFearGained + this.state.totalFearSpent;
    if (score >= 9) return 'critical';
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  // ===== Change Notification =====

  private markDirty(key: string): void {
    this.dirtyFlags.add(key);
    this.notifyListeners();
  }

  onChange(key: string, listener: (state: SessionState) => void): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(key);
      if (s) {
        s.delete(listener);
        if (s.size === 0) this.listeners.delete(key);
      }
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listenerSet of this.listeners.values()) {
      for (const listener of listenerSet) {
        try {
          listener(state);
        } catch {
          // Listener errors should not break the state manager
        }
      }
    }
    this.dirtyFlags.clear();
  }

  // ===== Adventure Messages (server-side persistence) =====

  addAdventureMessage(msg: PersistedAdventureMessage): void {
    this.adventureMessages.push(msg);
    // Cap at 500 in memory
    if (this.adventureMessages.length > 500) {
      this.adventureMessages = this.adventureMessages.slice(-500);
    }
  }

  getAdventureMessages(): PersistedAdventureMessage[] {
    return [...this.adventureMessages];
  }

  // ===== Persistence =====

  /**
   * Export state for file persistence.
   * Strips runtime-only fields (socket IDs, isConnected, combat state).
   */
  toPersisted(code: string): PersistedSession {
    // Strip runtime fields from players (isConnected is transient)
    const persistedPlayers = this.state.players.map(p => ({
      id: p.id,
      name: p.name,
      characterName: p.character?.name,
      joinedAt: p.joinedAt,
    }));

    return {
      sessionId: this.state.sessionId,
      code,
      status: this.state.status,
      currentScene: {
        id: this.state.currentScene.id,
        name: this.state.currentScene.name,
        description: this.state.currentScene.description,
        environment: this.state.currentScene.environment,
      },
      fearPoints: this.state.fearPoints,
      totalFearGained: this.state.totalFearGained,
      totalFearSpent: this.state.totalFearSpent,
      character: this.state.character,
      characters: this.state.characters,
      players: persistedPlayers,
      timeline: this.state.timeline,
      campaignState: this.state.campaignState,
      adventureMessages: this.adventureMessages,
      shortRestsSinceLong: this.state.shortRestsSinceLong,
      spotlightState: this.state.spotlightState,
      safetyState: this.state.safetyState,
      createdAt: Date.now(),
    };
  }

  /**
   * Restore state from persisted data.
   * Runtime fields (isConnected, combat, etc.) get safe defaults.
   */
  loadFromPersisted(data: PersistedSession): void {
    // Restore core session fields
    this.state.sessionId = data.sessionId;
    this.state.status = data.status || 'setup';
    this.state.fearPoints = data.fearPoints || 0;
    this.state.totalFearGained = data.totalFearGained || 0;
    this.state.totalFearSpent = data.totalFearSpent || 0;
    this.state.shortRestsSinceLong = data.shortRestsSinceLong || 0;

    // Restore spotlight state
    if (data.spotlightState) {
      this.state.spotlightState = data.spotlightState;
    }

    // Restore safety state
    if (data.safetyState) {
      this.state.safetyState = data.safetyState;
    }

    // Restore character
    if (data.character) {
      this.state.character = data.character;
    }

    // Restore characters array
    if (data.characters) {
      this.state.characters = data.characters;
    }

    // Restore players — mark all as disconnected (they'll reconnect)
    if (data.players) {
      this.state.players = data.players.map(p => ({
        id: p.id,
        name: p.name,
        character: data.characters?.find(c => c.name === p.characterName) || (data.character as Character) || null as unknown as Character,
        isConnected: false,  // Will be set to true on reconnect
        joinedAt: p.joinedAt || Date.now(),
      }));
    }

    // Restore scene
    if (data.currentScene) {
      this.state.currentScene = {
        ...this.state.currentScene,
        id: data.currentScene.id || 'initial',
        name: data.currentScene.name || '开场',
        description: data.currentScene.description || '',
        environment: data.currentScene.environment || '',
        // These runtime fields get defaults — AI GM will fill them on next narration
        activeConditions: [],
        npcPresent: [],
        enemies: [],
        countdowns: [],
      };
    }

    // Restore timeline
    if (data.timeline) {
      this.state.timeline = data.timeline;
    }

    // Restore campaign state
    if (data.campaignState) {
      this.state.campaignState = {
        ...this.state.campaignState,
        ...data.campaignState,
      } as CampaignState;
    }

    // Restore adventure messages
    if (data.adventureMessages) {
      this.adventureMessages = data.adventureMessages;
    }

    // Reset combat state — can't meaningfully persist mid-combat
    // (enemies, conditions, etc. will be recreated by AI GM on next narration)
    this.state.activeCombat = undefined;

    this.notifyListeners();
  }

  // ===== Snapshot =====

  getSnapshot(): Record<string, unknown> {
    return {
      state: this.getState(),
      timestamp: Date.now(),
    };
  }
}
