import type {
  Attribute,
  RollResultType,
  DamageSeverity,
  ConditionInstance,
  RestType,
  DeathMoveType,
  ReactionTrigger,
  ReactionType,
} from './rules';
import type {
  Character,
  EnemyStatBlock,
  EnemyFeature,
  Faction,
  NPC,
  Gold,
  EnemyBehaviorType,
  EnemyAttack,
  EnemyExperienceData,
  EnemyType,
} from './character';
import type { SpotlightState, SafetyState } from './safety';
import type { GameCampaignState } from './base';

// ===== 游戏事件类型 =====

export interface GameEvent {
  id: string;
  sessionId: string;
  playerId?: string;         // 事件发起玩家ID
  timestamp: number;
  type: GameEventType;
}

export type GameEventType =
  // 玩家行动
  | 'player:action'
  | 'player:dialogue'
  | 'player:roll'
  | 'player:useHope'
  | 'player:useExperience'
  | 'player:rest'
  | 'player:deathMove'
  | 'player:swapDomainCard'
  // AI GM 行动
  | 'gm:narrate'
  | 'gm:narrate:start'
  | 'gm:narrate:delta'
  | 'gm:narrate:end'
  | 'gm:sceneChange'
  | 'gm:useFear'
  | 'gm:enemyAction'
  | 'gm:ruling'
  | 'gm:setDifficulty'
  | 'gm:award'
  | 'gm:triggerCountdown'
  // 战斗事件
  | 'combat:start'
  | 'combat:end'
  | 'combat:attack'
  | 'combat:damage'
  | 'combat:heal'
  | 'combat:conditionApply'
  | 'combat:conditionRemove'
  | 'combat:enemyDefeated'
  | 'combat:focus'
  | 'combat:reactionPrompt'
  | 'combat:reactionDeclare'
  | 'combat:reactionResult'
  // 场景事件
  | 'scene:describe'
  | 'scene:transition'
  | 'scene:environmentChange'
  // 战役事件
  | 'session:start'
  | 'session:end'
  | 'session:pause'
  | 'session:resume'
  | 'campaign:milestone'
  | 'campaign:levelUp'
  | 'faction:relationChange'
  | 'faction:action'
  | 'faction:missionComplete'
  // 德拉肯海姆特殊事件
  | 'drakkenheim:contamination'
  | 'drakkenheim:hazeEffect'
  | 'drakkenheim:deleriumFound'
  | 'drakkenheim:sealFound'
  // 聚光灯 / 回合管理
  | 'spotlight:request'
  | 'spotlight:state'
  | 'action:queued'
  // 安全工具
  | 's0:submit'
  | 's0:ready'
  | 's0:complete'
  | 'safety:xcard'
  | 'safety:paused'
  | 'safety:resume'
  | 'safety:resumed'
  | 'safety:update';

// ===== 具体事件载荷 =====

export interface PlayerActionEvent extends GameEvent {
  type: 'player:action';
  characterId: string;
  action: string;
  attribute?: Attribute;
  difficulty?: number;
  experienceUsed?: string;
  hopeSpent?: number;
}

export interface PlayerRollEvent extends GameEvent {
  type: 'player:roll';
  characterId: string;
  hopeDie: number;
  fearDie: number;
  modifier: number;
  difficulty: number;
  result: RollResultType;
  total: number;
  advantageCount: number;
  disadvantageCount: number;
  rollType: 'action' | 'reaction' | 'damage';
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
  armorSlotUsed: boolean;
}

/** Server prompts a player that they can use a reaction */
export interface CombatReactionPromptEvent extends GameEvent {
  type: 'combat:reactionPrompt';
  trigger: ReactionTrigger;
  sourceId: string;
  sourceType: 'enemy' | 'gm' | 'environment';
  targetId: string;
  rawDamage?: number;
  severity?: DamageSeverity;
  attackName?: string;
  availableReactions: Array<{
    type: ReactionType;
    name: string;
    description: string;
    attribute?: Attribute;
    difficulty?: number;
    hopeCost?: number;
    usesReaction: boolean;
    sourceId?: string;
    sourceType?: 'ancestry' | 'class' | 'community' | 'domainCard';
  }>;
}

/** Player declares which reaction to use */
export interface CombatReactionDeclareEvent extends GameEvent {
  type: 'combat:reactionDeclare';
  reactionType: ReactionType;
  hopeDie?: number;
  fearDie?: number;
  armorSlotsToSpend?: number;
  sourceId?: string;
}

/** Server broadcasts the result of a resolved reaction */
export interface CombatReactionResultEvent extends GameEvent {
  type: 'combat:reactionResult';
  reactionType: ReactionType;
  characterId: string;
  success: boolean;
  isCritical: boolean;
  damagePrevented: number;
  newSeverity?: DamageSeverity;
  armorSlotsSpent: number;
  counterDamage?: number;
  counterTargetHpLoss?: number;
  hopeGain: number;
  hopeCost: number;
  reactionUsed: boolean;
  narrationHint: string;
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

export interface GmNarrateEvent extends GameEvent {
  type: 'gm:narrate';
  narration: string;
  sceneUpdate?: Partial<SceneState>;
}

export interface FactionRelationChangeEvent extends GameEvent {
  type: 'faction:relationChange';
  factionId: string;
  change: number;
  newRelation: number;
  reason: string;
}

// ===== 玩家类型 =====

export interface Player {
  id: string;            // socket.id 或客户端生成
  name: string;
  character: Character;
  isConnected: boolean;
  joinedAt: number;
}

// ===== 会话状态 =====

export type SessionStatus = 'setup' | 'characterCreation' | 'sessionZero' | 'active' | 'resting' | 'combat' | 'paused' | 'ended';

export type SessionZeroPhase = 'safety' | 'worldbuilding' | 'connections' | 'expectations' | 'narrativePact';

export interface SessionZeroData {
  safetyTools?: { lines: string[]; veils: string[]; xCard: boolean };
  worldbuildingAnswers?: Record<string, string>;
  characterConnections?: string[];
  tonePreferences?: string[];
  narrativePactConfirmed?: boolean;
}

export interface SessionState {
  sessionId: string;
  sessionCode?: string;          // 6位房间码，多人模式使用
  status: SessionStatus;
  systemId: string;              // 规则系统: 'daggerheart' | 'coc' | 'dnd5e' 等，默认 'daggerheart'
  character: Character | null;     // 保留向后兼容（单人模式下 = characters[0]），null until set
  characters: Character[];       // 多人模式下的角色列表
  players: Player[];             // 多人模式下的玩家列表
  currentScene: SceneState;
  fearPoints: number;              // GM恐惧点池
  totalFearGained: number;
  totalFearSpent: number;
  activeCombat?: CombatState;
  timeline: TimelineEntry[];
  shortRestsSinceLong: number;     // 两次长休间最多3次短休
  campaignState: CampaignState;
  characterCreationStep?: number;
  sessionZeroPhase?: SessionZeroPhase;  // S0阶段，仅在status==='sessionZero'时存在
  sessionZeroData?: SessionZeroData;    // S0收集的数据
  spotlightState?: SpotlightState;      // 聚光灯/回合管理
  safetyState?: SafetyState;           // 安全工具状态
  sceneDifficulty?: number;            // AI评估的当前场景难度（默认15）
}

export interface SceneState {
  id: string;
  name: string;
  description: string;
  locationId?: string;
  environment: string;
  activeConditions: ConditionInstance[];
  npcPresent: string[];
  enemies: string[];
  countdowns: Countdown[];
}

export interface CombatState {
  id: string;
  round: number;
  enemies: CombatEnemy[];
  activeConditions: ActiveCondition[];
  fearPointsUsed: number;
  currentFocus?: string;           // 当前聚焦的敌人ID
}

export interface CombatEnemy {
  id: string;
  statBlockId: string;
  name: string;
  currentHp: number;
  maxHp: number;
  currentStress: number;
  maxStress: number;
  conditions: ConditionInstance[];
  isFocused: boolean;
  hasActed: boolean;
  evasion: number;
  behavior: EnemyBehaviorType;
  attacks: EnemyAttack[];
  features: EnemyFeature[];
  experiences?: EnemyExperienceData[];
  fearTraits?: EnemyFearTrait[];
  type?: EnemyType;               // 敌人类型，默认'elite'
  majorThreshold?: number;        // 重度伤害阈值
  severeThreshold?: number;       // 严重伤害阈值
  minionDefeatThreshold?: number; // 杂兵额外击败阈值
  /** Rules: Ch4 "集群" — horde damage when at or below half HP */
  hordeDamage?: number;
  /** Rules: Ch4 "无情" — number of times this enemy can be focused per GM turn */
  relentlessCount?: number;
  /** Rules: Ch4 "迟缓" — first focus does nothing, needs second focus to act */
  isSlow?: boolean;
  /** Track how many times focused this turn (for relentless/slow) */
  timesFocusedThisTurn?: number;
}

export interface EnemyFearTrait {
  name: string;
  cost: number;
  description: string;
}

export interface ActiveCondition {
  targetId: string;
  targetType: 'player' | 'enemy';
  condition: ConditionInstance;
  roundsRemaining?: number;
}

export interface TimelineEntry {
  id: string;
  timestamp: number;
  eventType: GameEventType;
  summary: string;
  isKeyMoment: boolean;
  data?: Record<string, unknown>;
}

// ===== 倒计时系统 =====

export interface Countdown {
  id: string;
  name: string;
  description: string;
  currentValue: number;
  maxValue: number;
  decrementOn: 'playerAction' | 'fearResult' | 'round' | 'rest' | 'custom';
  triggerAt: number;               // 触发值（通常为0）
  triggered: boolean;
  triggerEffect: string;
}

// ===== 战役状态 =====

export interface CampaignState extends GameCampaignState {
  visitedLocations: string[];
  factionRelations: Record<string, number>;
  personalQuestProgress: Record<string, QuestProgress>;
  factionQuestProgress: Record<string, QuestProgress>;
  contaminationLevel: number;
  deleriumCollected: number;
  sealsFound: string[];
  currentChapter: CampaignChapter;
  hazeExpansion: number;           // 迷雾扩展进度
  narrativeFlags: Record<string, boolean>;
}

export type CampaignChapter =
  | 'arrival'           // 初到余烬村
  | 'outerCity'         // 外城探索
  | 'firstFactions'     // 首次接触派系
  | 'innerCity'         // 内城探索
  | 'factionConflict'   // 派系冲突
  | 'strongholds'       // 攻打据点
  | 'finalExpedition'   // 最终远征
  | 'fate';             // 德拉肯海姆的命运

export interface QuestProgress {
  questId: string;
  status: 'notStarted' | 'inProgress' | 'completed' | 'failed';
  milestones: string[];
  currentObjective?: string;
}

// ===== AI GM 消息 =====

export type AIMessageRole = 'narrator' | 'npc' | 'system' | 'combat' | 'player';

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: number;
  npcName?: string;
  npcId?: string;
  choices?: AIChoice[];
  rollRequired?: boolean;
  difficulty?: number;
  attribute?: Attribute;
}

export interface AIChoice {
  id: string;
  label: string;
  description?: string;
  action?: string;
  requiresRoll?: boolean;
  difficulty?: number;
}
