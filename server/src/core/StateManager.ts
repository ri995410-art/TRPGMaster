import type {
  SessionState,
  SessionZeroData,
  SessionZeroPhase,
  SceneState,
  CombatState,
  CombatEnemy,
  ConditionInstance,
  TimelineEntry,
  GameEvent,
  GameEventType,
  CampaignState,
  Player,
  SpotlightState,
  SafetyState,
} from '@trpgmaster/shared';
import { getTier } from '@trpgmaster/shared';
import type { Character, InventoryItem } from '@trpgmaster/shared';
import type { PersistedSession, PersistedAdventureMessage } from './SessionPersistence';

export class StateManager {
  private state: SessionState;
  private listeners: Map<string, Set<(state: SessionState) => void>>;
  private dirtyFlags: Set<string>;
  // Adventure messages — stored server-side for persistence
  private adventureMessages: PersistedAdventureMessage[];
  // Track original creation timestamp across persist cycles
  private createdAt: number;

  constructor(sessionId: string) {
    this.state = this.createInitialState(sessionId);
    this.listeners = new Map();
    this.dirtyFlags = new Set();
    this.adventureMessages = [];
    this.createdAt = Date.now();
  }

  private createInitialState(sessionId: string): SessionState {
    return {
      sessionId,
      systemId: 'daggerheart',
      status: 'setup',
      character: null,                   // Set during character creation
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

  getCharacter(): Character | null {
    if (!this.state.character) return null;
    return JSON.parse(JSON.stringify(this.state.character));
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
    // Rules: Chapter 3 "恐惧点" — session start fear = player character count
    if (this.state.fearPoints === 0 && this.state.players.length > 0) {
      this.state.fearPoints = this.state.players.length;
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

    // Always sync characters array — find existing or push new
    const existingIdx = this.state.characters.findIndex(c => c.id === character.id);
    if (existingIdx >= 0) {
      this.state.characters[existingIdx] = { ...character };
    } else {
      this.state.characters.push({ ...character });
    }

    // Always sync the matching player's character reference
    const playerIdx = this.state.players.findIndex(p => p.character?.id === character.id);
    if (playerIdx >= 0) {
      this.state.players[playerIdx].character = { ...character };
    }

    this.markDirty('character');
  }

  /** Sync backward-compat state.character → state.players[0].character + state.characters[0] */
  private syncBackwardCompat(): void {
    if (!this.state.character) return;
    if (this.state.players.length > 0 && this.state.players[0].character) {
      this.state.players[0].character = { ...this.state.character };
      const idx = this.state.characters.findIndex(c => c.id === this.state.character!.id);
      if (idx >= 0) {
        this.state.characters[idx] = { ...this.state.character };
      }
    }
  }

  updateCharacterHp(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.hp = Math.max(0, Math.min(char.maxHp, char.hp + delta));

    // HP dropped to 0 → enter Dying condition
    if (char.hp <= 0 && delta < 0) {
      const alreadyDying = char.conditions?.some(c => c.condition === 'dying');
      if (!alreadyDying) {
        char.conditions = char.conditions || [];
        char.conditions.push({
          condition: 'dying',
          duration: 'special',
          source: 'HP降至0',
          clearCondition: '执行死亡行动后恢复',
        });
      }
    }

    this.syncBackwardCompat();
    this.markDirty('character');
    return true;
  }

  updateCharacterStress(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    const newStress = char.stress + delta;
    // Rules: Chapter 2 "状态" — when stress markers are full, character gains Vulnerable condition
    if (newStress >= char.maxStress && delta > 0 && char.stress < char.maxStress) {
      // Stress just filled up — apply Vulnerable condition
      const alreadyVulnerable = char.conditions?.some(c => c.condition === 'vulnerable');
      if (!alreadyVulnerable) {
        char.conditions = char.conditions || [];
        char.conditions.push({
          condition: 'vulnerable',
          duration: 'special',
          source: '压力溢出',
          clearCondition: '压力降至maxStress以下时解除',
        });
      }
    }
    // If stress would overflow max, mark HP instead
    if (newStress > char.maxStress) {
      const overflow = newStress - char.maxStress;
      char.stress = char.maxStress;
      char.hp = Math.max(0, char.hp - overflow);
    } else {
      char.stress = Math.max(0, newStress);
    }
    // Remove Vulnerable if stress drops below maxStress
    if (char.stress < char.maxStress && char.conditions?.some(c => c.condition === 'vulnerable')) {
      const vulnIdx = char.conditions.findIndex(c => c.condition === 'vulnerable' && c.source === '压力溢出');
      if (vulnIdx >= 0) {
        char.conditions.splice(vulnIdx, 1);
      }
    }
    this.syncBackwardCompat();
    this.markDirty('character');
    return true;
  }

  updateCharacterHope(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.hope = Math.max(0, Math.min(char.maxHope, char.hope + delta));
    this.syncBackwardCompat();
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
    this.syncBackwardCompat();
    this.markDirty('character');
    return true;
  }

  /** Adjust armor slots by numeric delta (negative = spend, positive = recover), clamped to [0, maxArmorSlots] */
  adjustCharacterArmorSlots(delta: number): boolean {
    const char = this.state.character;
    if (!char) return false;

    char.armorSlots = Math.max(0, Math.min(char.maxArmorSlots, char.armorSlots + delta));
    this.syncBackwardCompat();
    this.markDirty('character');
    return true;
  }

  updateCharacter(updates: Partial<Character>): boolean {
    const char = this.state.character;
    if (!char) return false;

    Object.assign(char, updates);
    this.syncBackwardCompat();
    this.markDirty('character');
    return true;
  }

  addInventoryItem(item: { id: string; name: string; quantity: number; description?: string; category?: string }): void {
    const char = this.state.character;
    if (!char) return;
    const existing = char.inventory.find(i => i.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      char.inventory.push({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        description: item.description,
        equipped: false,
        category: (['consumable', 'tool', 'treasure', 'misc'].includes(item.category ?? '') ? item.category as InventoryItem['category'] : 'misc'),
      });
    }
    this.syncBackwardCompat();
    this.markDirty('character');
  }

  addGold(gold: { coins: number; handfuls: number; bags: number; chests: number }): void {
    const char = this.state.character;
    if (!char) return;
    char.gold.coins += gold.coins;
    char.gold.handfuls += gold.handfuls;
    char.gold.bags += gold.bags;
    char.gold.chests += gold.chests;
    // Consolidate
    if (char.gold.coins >= 10) {
      char.gold.handfuls += Math.floor(char.gold.coins / 10);
      char.gold.coins = char.gold.coins % 10;
    }
    if (char.gold.handfuls >= 10) {
      char.gold.bags += Math.floor(char.gold.handfuls / 10);
      char.gold.handfuls = char.gold.handfuls % 10;
    }
    this.syncBackwardCompat();
    this.markDirty('character');
  }

  incrementCombatRound(): void {
    if (this.state.activeCombat) {
      this.state.activeCombat.round++;
      this.markDirty('combat');
    }
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

  // Rules: Chapter 2 "恐惧点" — fear points cap at 12
  private static readonly FEAR_POINT_CAP = 12;

  addFearPoints(points: number): void {
    this.state.fearPoints = Math.min(StateManager.FEAR_POINT_CAP, this.state.fearPoints + points);
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

  /** Mark an enemy as having acted this round */
  markEnemyActed(enemyId: string): void {
    const combat = this.state.activeCombat;
    if (!combat) return;
    const enemy = combat.enemies.find(e => e.id === enemyId);
    if (enemy) {
      enemy.hasActed = true;
      this.markDirty('combat');
    }
  }

  /** Add a condition to the character */
  addCharacterCondition(condition: ConditionInstance): void {
    const char = this.state.character;
    if (!char) return;
    char.conditions = char.conditions || [];
    // Don't stack identical conditions — keep the longer duration
    const existing = char.conditions.find(c => c.condition === condition.condition);
    if (existing) {
      if (condition.roundsRemaining !== undefined && existing.roundsRemaining !== undefined) {
        if (condition.roundsRemaining > existing.roundsRemaining) {
          existing.roundsRemaining = condition.roundsRemaining;
          existing.source = condition.source;
        }
      }
    } else {
      char.conditions.push(condition);
    }
    this.markDirty('character');
  }

  /** Consume armor slots by count (not just 1) */
  consumeCharacterArmorSlots(count: number): void {
    const char = this.state.character;
    if (!char) return;
    char.armorSlots = Math.max(0, char.armorSlots - count);
    this.markDirty('character');
  }

  /** Apply death move result: remove Dying condition and apply effects */
  applyDeathMoveResult(result: {
    characterDied: boolean;
    hpRestored: number;
    stressCleared: number;
    scarGained: boolean;
    conditionApplied?: string;
    stressGained?: number;
    fearGained?: number;
  }): void {
    const char = this.state.character;
    if (!char) return;

    // Remove Dying condition
    char.conditions = (char.conditions || []).filter(c => c.condition !== 'dying');

    if (result.characterDied) {
      // Character is dead — set HP to 0 and mark as permanently dead
      char.hp = 0;
    } else {
      // Restore HP
      if (result.hpRestored > 0 && result.hpRestored < 999) {
        char.hp = Math.min(char.maxHp, result.hpRestored);
      } else if (result.hpRestored >= 999) {
        char.hp = char.maxHp; // Desperate Gamble critical: full restore
      }
    }

    // Clear stress
    if (result.stressCleared > 0 && result.stressCleared < 999) {
      char.stress = Math.max(0, char.stress - result.stressCleared);
    } else if (result.stressCleared >= 999) {
      char.stress = 0;
    }

    // Rules: Ch2 "回避死亡" — apply condition (unconscious)
    if (result.conditionApplied) {
      char.conditions = char.conditions || [];
      if (!char.conditions.some(c => c.condition === result.conditionApplied)) {
        char.conditions.push({
          condition: result.conditionApplied,
          duration: 'temporary',
          source: '回避死亡',
          clearCondition: '接受治疗或其他效果',
        });
      }
    }

    // Rules: Ch2 "局势恶化" — gain stress and fear
    if (result.stressGained && result.stressGained > 0) {
      this.updateCharacterStress(result.stressGained);
    }
    if (result.fearGained && result.fearGained > 0) {
      this.addFearPoints(result.fearGained);
    }

    // Gain scar (reduces maxHope)
    // Rules: Chapter 2 "死亡 — 伤痕" — crossing out last hope slot → character must retire
    if (result.scarGained) {
      char.maxHope = Math.max(0, char.maxHope - 1);
      // Add Scar object
      char.scars = char.scars || [];
      char.scars.push({
        id: `scar_${Date.now()}`,
        name: '伤痕',
        description: '因回避死亡获得的伤痕',
        lostHopeSlot: true,
        narrative: result.scarGained ? '回避死亡时获得伤痕，永久失去1希望槽' : '',
      });
      // If maxHope reaches 0, character must retire
      if (char.maxHope <= 0) {
        char.conditions = char.conditions || [];
        char.conditions.push({
          condition: 'mustRetire',
          duration: 'permanent',
          source: '伤痕耗尽所有希望槽',
          clearCondition: '角色必须退役',
        });
      }
    }

    this.syncBackwardCompat();
    this.markDirty('character');
  }

  // ===== Scene Management =====

  setCurrentScene(scene: SceneState): void {
    this.state.currentScene = scene;
    this.markDirty('scene');
  }

  setSceneDifficulty(difficulty: number): void {
    this.state.sceneDifficulty = difficulty;
    this.markDirty('scene');
  }

  getSceneDifficulty(): number {
    return this.state.sceneDifficulty ?? 15;
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

  /** Add an enemy to combat — starts combat if not active */
  addCombatEnemy(enemy: CombatEnemy): void {
    if (!this.state.activeCombat) {
      this.startCombat([enemy]);
    } else {
      this.state.activeCombat.enemies.push(enemy);
      this.markDirty('combat');
    }
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
      characterId: p.character?.id,
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
      activeCombat: this.state.activeCombat || undefined,
      createdAt: this.createdAt,
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
      this.state.players = data.players.map(p => {
        // Prefer characterId matching, fall back to name matching
        const matchedChar = (p.characterId && data.characters?.find(c => c.id === p.characterId))
          || data.characters?.find(c => c.name === p.characterName)
          || (data.character as Character)
          || null;
        return {
          id: p.id,
          name: p.name,
          character: matchedChar,
          isConnected: false,  // Will be set to true on reconnect
          joinedAt: p.joinedAt || Date.now(),
        };
      });
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

    // Restore combat state if present
    if (data.activeCombat) {
      this.state.activeCombat = data.activeCombat;
    } else {
      this.state.activeCombat = undefined;
    }

    // Preserve original creation timestamp
    if (data.createdAt) {
      this.createdAt = data.createdAt;
    }

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
