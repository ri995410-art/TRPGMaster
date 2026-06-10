import type {
  SessionState,
  PlayerState,
  SceneState,
  CombatState,
  CombatEnemy,
  TimelineEntry,
  GameEvent,
  GameEventType,
  CorruptionLevel,
} from '@trpgmaster/shared';
import { getTier } from '@trpgmaster/shared';
import type { Character } from '@trpgmaster/shared';

export class StateManager {
  private state: SessionState;
  private listeners: Map<string, Set<(state: SessionState) => void>>;
  private characters: Map<string, Character>;
  private dirtyFlags: Set<string>;

  constructor(sessionId: string, gmId: string, ruleSystem: SessionState['ruleSystem'] = 'daggerheart') {
    this.state = this.createInitialState(sessionId, gmId, ruleSystem);
    this.listeners = new Map();
    this.characters = new Map();
    this.dirtyFlags = new Set();
  }

  private createInitialState(sessionId: string, gmId: string, ruleSystem: SessionState['ruleSystem']): SessionState {
    return {
      sessionId,
      ruleSystem,
      status: 'setup',
      gmId,
      players: [],
      currentScene: {
        id: 'initial',
        name: '开场',
        description: '',
        environment: '',
        activeConditions: [],
        npcPresent: [],
        enemies: [],
      },
      fearPoints: 0,
      totalFearGained: 0,
      totalFearSpent: 0,
      roundTracker: {
        currentRound: 0,
        playerActionsRemaining: {},
      },
      timeline: [],
    };
  }

  // ===== State Access =====

  getState(): SessionState {
    return JSON.parse(JSON.stringify(this.state));
  }

  getCharacter(characterId: string): Character | undefined {
    return this.characters.get(characterId);
  }

  getAllCharacters(): Character[] {
    return Array.from(this.characters.values());
  }

  // ===== Session Management =====

  startSession(): void {
    this.state.status = 'active';
    this.state.roundTracker.currentRound = 1;
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

  // ===== Player Management =====

  addPlayer(player: PlayerState): void {
    this.state.players.push(player);
    this.markDirty('players');
  }

  removePlayer(playerId: string): void {
    this.state.players = this.state.players.filter(p => p.playerId !== playerId);
    this.markDirty('players');
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    const player = this.state.players.find(p => p.playerId === playerId);
    if (player) {
      player.connected = connected;
      this.markDirty('players');
    }
  }

  setFocusToken(playerId: string): void {
    this.state.players.forEach(p => { p.isActing = p.playerId === playerId; });
    this.state.roundTracker.actingPlayerId = playerId;
    this.markDirty('roundTracker');
  }

  // ===== Character Management =====

  setCharacter(character: Character): void {
    this.characters.set(character.id, { ...character });
    this.markDirty(`character:${character.id}`);
  }

  updateCharacterHp(characterId: string, delta: number): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char };
    updated.hp = Math.max(0, Math.min(updated.maxHp, updated.hp + delta));
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
  }

  updateCharacterStress(characterId: string, delta: number): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char };
    const newStress = updated.stress + delta;
    // If stress would overflow max, mark HP instead
    if (newStress > updated.maxStress) {
      const overflow = newStress - updated.maxStress;
      updated.stress = updated.maxStress;
      updated.hp = Math.max(0, updated.hp - overflow);
    } else {
      updated.stress = Math.max(0, newStress);
    }
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
  }

  updateCharacterHope(characterId: string, delta: number): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char };
    updated.hope = Math.max(0, Math.min(updated.maxHope, updated.hope + delta));
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
  }

  updateCharacterCorruption(characterId: string, level: CorruptionLevel): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char };
    updated.corruption = level;
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
  }

  updateCharacterArmorSlots(characterId: string, used: boolean): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char };
    if (used && updated.armorSlots > 0) {
      updated.armorSlots -= 1;
    } else if (!used && updated.armorSlots < updated.maxArmorSlots) {
      updated.armorSlots += 1;
    }
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
  }

  updateCharacter(characterId: string, updates: Partial<Character>): boolean {
    const char = this.characters.get(characterId);
    if (!char) return false;

    // Clone before mutation to prevent state leakage
    const updated = { ...char, ...updates };
    this.characters.set(characterId, updated);
    this.markDirty(`character:${characterId}`);
    return true;
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

  setExplorationTimer(timer: number): void {
    this.state.explorationTimer = timer;
    this.markDirty('explorationTimer');
  }

  decrementExplorationTimer(): number {
    if (this.state.explorationTimer !== undefined && this.state.explorationTimer > 0) {
      this.state.explorationTimer -= 1;
      this.markDirty('explorationTimer');
    }
    return this.state.explorationTimer ?? 0;
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

  // ===== Snapshot =====

  getSnapshot(): Record<string, unknown> {
    return {
      state: this.getState(),
      characters: this.getAllCharacters(),
      timestamp: Date.now(),
    };
  }
}
