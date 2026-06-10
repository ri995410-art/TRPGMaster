import type { RollResultType, DamageSeverity, Attribute, Condition, RuleSystemId } from './rules';
import type { CorruptionLevel } from './character';

// ===== Game Event Types =====

// Base event structure
export interface GameEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: GameEventType;
  source: EventSource;
}

export type EventSource = 'gm' | 'player' | 'system' | 'agent';

export type GameEventType =
  // Player actions
  | 'player:action'
  | 'player:dialogue'
  | 'player:roll'
  | 'player:useHope'
  | 'player:useExperience'
  | 'player:rest'
  | 'player:deathMove'
  // GM actions
  | 'gm:sceneChange'
  | 'gm:useFear'
  | 'gm:enemyAction'
  | 'gm:ruling'
  | 'gm:narrate'
  | 'gm:award'
  | 'gm:publishSuggestion'
  // Combat events
  | 'combat:start'
  | 'combat:end'
  | 'combat:attack'
  | 'combat:damage'
  | 'combat:heal'
  | 'combat:conditionApply'
  | 'combat:conditionRemove'
  | 'combat:enemyDefeated'
  // Scene events
  | 'scene:describe'
  | 'scene:transition'
  | 'scene:environmentChange'
  // System events
  | 'session:start'
  | 'session:end'
  | 'session:pause'
  | 'session:resume'
  | 'agent:output'
  | 'agent:request'
  // Faction events
  | 'faction:relationChange'
  | 'faction:action'
  // Campaign events
  | 'campaign:milestone'
  | 'campaign:corruptionChange'
  // Input events
  | 'input:voice'
  | 'input:vision'
  | 'input:text'
  | 'input:parsed'
  // Image events
  | 'image:generate'
  | 'image:complete'
  // Novel events
  | 'novel:generate'
  | 'novel:complete';

// ===== Specific Event Payloads =====

export interface PlayerActionEvent extends GameEvent {
  type: 'player:action';
  playerId: string;
  characterId: string;
  action: string;
  attribute?: Attribute;
  difficulty?: number;
  experienceUsed?: string;
  hopeSpent?: number;
}

export interface PlayerRollEvent extends GameEvent {
  type: 'player:roll';
  playerId: string;
  characterId: string;
  hopeDie: number;
  fearDie: number;
  modifier: number;
  difficulty: number;
  result: RollResultType;
  total: number;
  advantageCount?: number; // number of advantage d6s
  disadvantageCount?: number; // number of disadvantage d6s
  rollType?: 'action' | 'reaction'; // reaction rolls don't generate hope/fear
}

export interface CombatAttackEvent extends GameEvent {
  type: 'combat:attack';
  attackerId: string;
  attackerType: 'player' | 'enemy';
  targetId: string;
  targetType: 'player' | 'enemy';
  attribute?: Attribute;
  rollResult?: RollResultType;
  hit: boolean;
  damage?: number;
  damageSeverity?: DamageSeverity;
  armorSlotUsed?: boolean;
  resisted?: boolean; // target has resistance to this damage type
  immune?: boolean; // target has immunity to this damage type
}

export interface CombatDamageEvent extends GameEvent {
  type: 'combat:damage';
  targetId: string;
  targetType: 'player' | 'enemy';
  amount: number;
  damageType: 'physical' | 'magical' | 'direct';
  severity: DamageSeverity;
  hpChange: number;
  armorSlotUsed: boolean;
}

export interface GmSceneChangeEvent extends GameEvent {
  type: 'gm:sceneChange';
  sceneId: string;
  sceneName: string;
  description: string;
  locationId?: string;
}

export interface FactionRelationChangeEvent extends GameEvent {
  type: 'faction:relationChange';
  factionId: string;
  change: number;
  newRelation: number;
  reason: string;
}

export interface CorruptionChangeEvent extends GameEvent {
  type: 'campaign:corruptionChange';
  characterId: string;
  oldLevel: CorruptionLevel;
  newLevel: CorruptionLevel;
  reason: string;
}

export interface AgentOutputEvent extends GameEvent {
  type: 'agent:output';
  agentType: AgentType;
  output: string;
  metadata?: Record<string, unknown>;
}

export type AgentType =
  | 'narrative'
  | 'rules'
  | 'sceneDirector'
  | 'npc'
  | 'combat'
  | 'faction'
  | 'imageDirector'
  | 'novel'
  | 'memoryCompressor'
  | 'intentParser'
  | 'unified';

// ===== Session State =====

export interface SessionState {
  sessionId: string;
  ruleSystem: RuleSystemId;
  status: 'setup' | 'active' | 'paused' | 'ended';
  gmId: string;
  players: PlayerState[];
  currentScene: SceneState;
  fearPoints: number;
  totalFearGained: number;
  totalFearSpent: number;
  explorationTimer?: number; // Drakkenheim-specific
  roundTracker: RoundTracker;
  activeCombat?: CombatState;
  timeline: TimelineEntry[];
}

export interface PlayerState {
  playerId: string;
  name: string;
  connected: boolean;
  characterId: string;
  isActing: boolean; // has focus token
}

export interface SceneState {
  id: string;
  name: string;
  description: string;
  locationId?: string;
  environment: string;
  activeConditions: Condition[];
  npcPresent: string[]; // NPC IDs
  enemies: string[]; // Enemy IDs
}

export interface RoundTracker {
  currentRound: number;
  actingPlayerId?: string;
  actingEnemyId?: string;
  playerActionsRemaining: Record<string, number>;
}

export interface CombatState {
  id: string;
  round: number;
  enemies: CombatEnemy[];
  activeConditions: ActiveCondition[];
  fearPointsUsed: number;
}

export interface CombatEnemy {
  id: string;
  statBlockId: string;
  name: string;
  currentHp: number;
  maxHp: number;
  currentStress: number;
  maxStress: number;
  conditions: Condition[];
  isFocused: boolean;
}

export interface ActiveCondition {
  targetId: string;
  targetType: 'player' | 'enemy';
  condition: Condition;
  source: string;
  duration?: number; // rounds, undefined = until removed
}

export interface TimelineEntry {
  id: string;
  timestamp: number;
  eventType: GameEventType;
  summary: string;
  isKeyMoment: boolean;
  data?: Record<string, unknown>;
}

// ===== Input Event Payloads =====

export type GameIntentType =
  | 'action'
  | 'dialogue'
  | 'query'
  | 'command'
  | 'narration'
  | 'combat_action'
  | 'character_introduction'
  | 'rest'
  | 'movement'
  | 'interaction'
  | 'image_generation'
  | 'unknown';

export interface ParsedIntent {
  intentType: GameIntentType;
  confidence: number;
  attributes: Record<string, unknown>;
  rawInput: string;
}

export interface InputTextPayload {
  text: string;
  source: 'gm' | 'player';
  characterId?: string;
}

export interface InputVoicePayload {
  audioData: string;
  format: 'wav' | 'mp3' | 'ogg' | 'webm';
  duration: number;
  language?: string;
}

export interface InputVisionPayload {
  imageData: string;
  format: 'jpeg' | 'png';
  timestamp: number;
}

export interface InputTextEvent extends GameEvent {
  type: 'input:text';
  payload: InputTextPayload;
}

export interface InputVoiceEvent extends GameEvent {
  type: 'input:voice';
  payload: InputVoicePayload;
}

export interface InputVisionEvent extends GameEvent {
  type: 'input:vision';
  payload: InputVisionPayload;
}

export interface InputParsedEvent extends GameEvent {
  type: 'input:parsed';
  originalType: GameEventType;
  parsedIntent: ParsedIntent;
  generatedEventTypes: GameEventType[];
}

// ===== Network Messages =====

// Risk levels for agent output authorization
export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

// Suggestion from AI agent (displayed to GM for review)
export interface Suggestion {
  id: string;
  agentType: AgentType;
  riskLevel: RiskLevel;
  timestamp: number;
  options: SuggestionOption[];
  autoSendAt?: number;   // L2: timestamp when default option auto-sends
  typeLabel: string;      // e.g. '[场景]' / '[NPC:老祭司]' / '[战斗]' / '[规则]'
  gmOnly?: string;        // Text only GM can see (e.g. NPC internal thoughts)
}

export interface SuggestionOption {
  label: string;    // e.g. '氛围渲染' / '友好' / '攻击最弱者'
  content: string;  // The actual text to send to players
}

export type SocketMessageType =
  | 'session:join'
  | 'session:leave'
  | 'session:start'
  | 'session:started'
  | 'session:end'
  | 'session:ended'
  | 'session:sync'
  | 'game:event'
  | 'game:state'
  | 'agent:stream'
  | 'agent:complete'
  | 'agent:dismiss'
  | 'agent:mode'
  | 'chat:message'
  | 'chat:undo'
  | 'dice:roll'
  | 'dice:result'
  | 'input:text'
  | 'input:voice'
  | 'input:vision'
  | 'input:parsed'
  | 'gm:publishSuggestion'
  | 'character:update';

export interface SocketMessage<T = unknown> {
  type: SocketMessageType;
  sessionId: string;
  senderId: string;
  payload: T;
  timestamp: number;
}
