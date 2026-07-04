import type {
  Attribute,
  DamageType,
  DamageSeverity,
  DomainType,
  ConditionInstance,
  Tier,
  WeaponData,
  ArmorData,
  ClassData,
  SubclassData,
  AncestryData,
  CommunityData,
  DamageDie,
  DeathMoveResult,
  DeathMoveType,
  CardEffect,
} from './rules';
import type { GameCharacter } from './base';

// ===== 角色创建步骤 =====

export type CharacterCreationStep =
  | 'class'          // 第一步：选择职业
  | 'ancestry'       // 第二步：选择种族
  | 'community'      // 第三步：选择社群
  | 'attributes'     // 第四步：分配属性
  | 'resources'      // 第五步：记录资源
  | 'equipment'      // 第六步：选择装备
  | 'backstory'      // 第七步：创作背景
  | 'experiences'    // 第七步（续）：创作经历
  | 'domainCards'    // 第八步：选择领域卡
  | 'relationships'; // 第九步：创作人际关系

// ===== 经历系统 =====

export interface Experience {
  id: string;
  name: string;
  modifier: number; // 初始+2，可升级
  flavor?: string;  // 风味描述（如"蓝宝石集团的刺客"而非仅"刺客"）
}

// ===== 领域卡系统 =====

export type DomainCardType = 'ability' | 'spell' | 'grimoire';

export interface DomainCard {
  id: string;
  name: string;
  nameEn: string;
  domain: DomainType;
  level: number;
  type: DomainCardType;
  recallCost: number;       // 回想费用（闪电标记数）
  description: string;
  effect: string;
  mechanicalEffects?: CardEffect[];  // 结构化效果（供规则引擎读取）
  hopeCost?: number;
  stressCost?: number;
  usesPerRest?: 'shortRest' | 'longRest' | 'session';
  usesPerEncounter?: number;
}

// 领域卡配置状态
export interface DomainCardConfig {
  loadout: DomainCard[];    // 配置（最多5张激活卡）
  vault: DomainCard[];      // 宝库（非激活卡）
  maxLoadout: number;       // 始终为5
}

// ===== 伤痕系统 =====

export interface Scar {
  id: string;
  name: string;
  description: string;
  lostHopeSlot: boolean;
  narrative: string; // 伤痕的叙事描述
}

// ===== 物品系统 =====

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  description?: string;
  equipped: boolean;
  category?: 'consumable' | 'tool' | 'treasure' | 'misc';
}

// ===== 金币系统 =====

export interface Gold {
  coins: number;   // 枚
  handfuls: number; // 把 (10枚)
  bags: number;     // 袋 (10把)
  chests: number;   // 箱 (10袋)
}

// ===== 抗性/免疫 =====

export interface Resistance {
  damageType: DamageType;
  mode: 'resistance' | 'immunity';
}

// ===== 角色完整状态（Daggerheart 规则特有） =====

export interface DaggerheartCharacter extends GameCharacter {
  // 身份
  classId: string;
  subclassId: string;
  ancestryId: string;
  secondAncestryId?: string;          // 混血：第二种族
  mixedAncestryFeature1?: string;
  mixedAncestryFeature2?: string;
  communityId: string;

  // 多职
  multiclass?: {
    classId: string;                   // 第二职业ID
    domain: DomainType;                // 选择的多职领域
  };

  // 等级与位阶
  tier: Tier;
  proficiency: number;                 // 熟练值（1-4，影响伤害骰数量）

  // 属性
  attributes: Record<Attribute, number>;
  attributeMarks: Record<Attribute, boolean>; // 已标记属性（升级用）

  // 核心资源
  stress: number;
  maxStress: number;
  hope: number;
  maxHope: number;                     // 通常6，伤痕会减少
  armorSlots: number;
  maxArmorSlots: number;

  // 闪避值与伤害阈值
  evasion: number;
  minorThreshold: number;              // 轻度伤害阈值
  majorThreshold: number;              // 重度伤害阈值
  severeThreshold: number;             // 严重伤害阈值

  // 装备
  mainWeapon: WeaponData;
  offWeapon?: WeaponData;
  armor: ArmorData;
  inventory: InventoryItem[];
  gold: Gold;

  // 特性
  experiences: Experience[];
  domainCardConfig: DomainCardConfig;
  featureUses: Record<string, number>;  // featureId → 剩余使用次数
  scars: Scar[];

  // 状态
  conditions: ConditionInstance[];

  // 抗性/免疫
  resistances: Resistance[];

  // 战斗追踪
  reactionsUsed: number;
  inspirationDice?: number;            // 吟游诗人的鼓舞骰
  menaceDice?: { die: DamageDie; current: number; max: number }; // 守护者的威势骰

  // 故事
  backstory: string;
  personalQuest: string;
  relationships: CharacterRelationship[];
  adventureSummaries: AdventureSummary[];
}

/** 向后兼容类型别名 — 现有代码无需改动 */
export type Character = DaggerheartCharacter;

export interface CharacterRelationship {
  targetName: string; // 目标角色名（可能是其他玩家或NPC）
  question: string;   // 关系问题
  answer: string;     // 回答
}

// ===== 战利品结果 =====

export interface LootResult {
  items: Array<{ id: string; name: string; description?: string; category?: string; quantity: number }>;
  gold?: { coins: number; handfuls: number; bags: number; chests: number };
}

// ===== 冒险总结 =====

export interface AdventureSummary {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  summary: string;          // 第三人称小说式叙事
  milestones: string[];     // AI 提取的关键里程碑
  locationsVisited: string[];
}

// ===== 辅助函数 =====

// 计算伤害阈值
export function calculateThresholds(
  armorBaseMinor: number,
  armorBaseMajor: number,
  level: number,
  modifiers: number = 0
): { minor: number; major: number; severe: number } {
  const minor = armorBaseMinor + level + modifiers;
  const major = armorBaseMajor + level + modifiers;
  const severe = major * 2;
  return { minor, major, severe };
}

// 判定伤害等级
export function getDamageSeverity(
  damage: number,
  majorThreshold: number,
  severeThreshold: number
): DamageSeverity {
  if (damage >= severeThreshold) return 'severe';
  if (damage >= majorThreshold) return 'major';
  if (damage > 0) return 'minor';
  return 'none';
}

// 伤害等级对应的HP损失 — canonical values are DAMAGE_SEVERITY_HP in rules.ts
// Kept here for backward compatibility; values must stay in sync.
export const HP_LOSS_BY_SEVERITY: Record<DamageSeverity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  severe: 3,
};

export function getHpLossFromSeverity(severity: DamageSeverity): number {
  return HP_LOSS_BY_SEVERITY[severity];
}

// ===== 敌人数据块 =====

export type EnemyType = 'minion' | 'horde' | 'elite' | 'solo' | 'boss'
  | 'bruiser' | 'ranged' | 'skulker' | 'social' | 'standard' | 'support' | 'leader';

/** 敌人行为类型——决定 AI 战术选择 */
export type EnemyBehaviorType = 'bruiser' | 'leader' | 'support' | 'solo' | 'ambusher' | 'caster';

/** 结构化伤害骰组件（不用正则解析字符串） */
export interface DamageDiceComponent {
  count: number;          // 骰子数量
  sides: number;          // 骰子面数（4/6/8/10/12）
}

/** 结构化伤害公式 */
export interface DamageFormula {
  dice: DamageDiceComponent[];
  modifier: number;           // 固定加值
  type: DamageType;           // physical / magical / direct
}

/** 敌人攻击定义 */
export interface EnemyAttack {
  name: string;
  attribute: Attribute;       // 攻击使用的属性
  distance: string;           // melee/nearby/close/far
  damage: DamageFormula;      // 结构化伤害公式
  targets?: 'single' | 'closeBlast' | 'farBlast' | 'all';  // 目标类型
  bonusDamage?: DamageFormula; // 条件额外伤害（如对脆弱目标）
  bonusDamageCondition?: string; // 额外伤害触发条件描述
  stressDamage?: number;       // 附加压力伤害
  conditionApplied?: string;   // 攻击附加的状态
  conditionDuration?: number;  // 附加状态持续回合数
}

export interface EnemyStatBlock {
  id: string;
  name: string;
  nameEn: string;
  type: EnemyType;
  behavior: EnemyBehaviorType;   // 行为类型——驱动自动战斗选择
  difficulty: number;            // 玩家攻击的难度值
  evasion: number;               // GM攻击的闪避值
  hp: number;
  maxHp: number;
  stress: number;
  maxStress: number;
  attacks: EnemyAttack[];        // 结构化攻击列表
  features: EnemyFeature[];
  experiences?: EnemyExperienceData[];  // 敌人经历（加值情境）
  fearCost: number;
  loot?: string;
  description?: string;
  tier: number;
  majorThreshold?: number;       // 重度伤害阈值（非minion必填）
  severeThreshold?: number;      // 严重伤害阈值（非minion必填）
  minionDefeatThreshold?: number; // 杂兵额外击败阈值：每造成X伤害额外击败一个（仅minion）
}

export interface EnemyFeature {
  name: string;
  type: 'action' | 'fear' | 'passive' | 'reaction';
  cost: number;
  description: string;
  /** fear 类型特化的结构化效果（可选，供规则引擎读取） */
  fearEffect?: {
    target: 'self' | 'allPlayers' | 'singlePlayer' | 'allEnemies';
    stressDamage?: number;
    hpDamage?: DamageFormula;
    conditionApplied?: string;
    conditionDuration?: number;
    moveDistance?: number;       // 移动距离
    summonEnemyId?: string;     // 召唤的敌人ID
    summonCount?: DamageFormula; // 召唤数量
    contaminationIncrease?: number; // 污染增加
  };
}

/** 敌人经历数据（规则书：敌人在特定情境下的加值） */
export interface EnemyExperienceData {
  name: string;
  modifier: number;
  situation: string;            // 适用情境描述
}

// ===== NPC =====

export interface NPC {
  id: string;
  name: string;
  nameEn?: string;
  factionId?: string;
  role: string;
  personality: string;
  motivation: string;
  secrets: string[];
  stressSlots: number;
  currentStress: number;
  locationId?: string;
}

// ===== 派系 =====

export interface Faction {
  id: string;
  name: string;
  nameEn: string;
  leader: string;
  lieutenant: string;
  baseLocation: string;
  agenda: string;
  ideology: string;
  relationRange: [number, number];
  boons: FactionBoon[];
}

export interface FactionBoon {
  name: string;
  description: string;
  minRelation: number;
  cost?: string;
}
