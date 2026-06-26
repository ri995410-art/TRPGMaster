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
} from './rules';
import { getTier } from './rules';

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

// ===== 角色完整状态 =====

export interface Character {
  id: string;
  name: string;

  // 身份
  classId: string;
  subclassId: string;
  ancestryId: string;
  secondAncestryId?: string;          // 混血：第二种族
  mixedAncestryFeature1?: string;
  mixedAncestryFeature2?: string;
  communityId: string;

  // 等级与位阶
  level: number;
  tier: Tier;
  proficiency: number;                 // 熟练值（1-4，影响伤害骰数量）

  // 属性
  attributes: Record<Attribute, number>;
  attributeMarks: Record<Attribute, boolean>; // 已标记属性（升级用）

  // 核心资源
  hp: number;
  maxHp: number;
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

// 伤害等级对应的HP损失
export function getHpLossFromSeverity(severity: DamageSeverity): number {
  switch (severity) {
    case 'none': return 0;
    case 'minor': return 1;
    case 'major': return 2;
    case 'severe': return 3;
  }
}

// ===== 敌人数据块 =====

export type EnemyType = 'minion' | 'elite' | 'solo' | 'boss';

export interface EnemyStatBlock {
  id: string;
  name: string;
  nameEn: string;
  type: EnemyType;
  difficulty: number;       // 玩家攻击的难度值
  evasion: number;          // GM攻击的闪避值
  hp: number;
  maxHp: number;
  stress: number;
  maxStress: number;
  attackDamage: string;     // 如 "2d8+3"
  attackAttribute: Attribute;
  attackDistance: string;
  features: EnemyFeature[];
  fearCost: number;
  loot?: string;
  description?: string;
  tier: number;
}

export interface EnemyFeature {
  name: string;
  type: 'action' | 'fear' | 'passive' | 'reaction';
  cost: number;
  description: string;
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
