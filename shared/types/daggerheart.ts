// ===== Daggerheart 规则特有的角色数据 =====
//
// 从 DaggerheartCharacter 中提取的规则特有字段，
// 用于 SystemCharacter<DaggerheartCharData> 的 systemData。

import type {
  Attribute,
  DomainType,
  DamageDie,
  ConditionInstance,
  Tier,
  WeaponData,
  ArmorData,
} from './rules';
import type {
  Experience,
  DomainCardConfig,
  Scar,
  InventoryItem,
  Gold,
  Resistance,
} from './character';

export interface DaggerheartCharData {
  // 身份
  classId: string;
  subclassId: string;
  ancestryId: string;
  secondAncestryId?: string;
  mixedAncestryFeature1?: string;
  mixedAncestryFeature2?: string;
  communityId: string;

  // 多职
  multiclass?: {
    classId: string;
    domain: DomainType;
  };

  // 等级与位阶
  tier: Tier;
  proficiency: number;

  // 属性
  attributes: Record<Attribute, number>;
  attributeMarks: Record<Attribute, boolean>;

  // 核心资源
  stress: number;
  maxStress: number;
  hope: number;
  maxHope: number;
  armorSlots: number;
  maxArmorSlots: number;

  // 闪避值与伤害阈值
  evasion: number;
  minorThreshold: number;
  majorThreshold: number;
  severeThreshold: number;

  // 装备
  mainWeapon: WeaponData;
  offWeapon?: WeaponData;
  armor: ArmorData;
  gold: Gold;

  // 特性
  experiences: Experience[];
  domainCardConfig: DomainCardConfig;
  featureUses: Record<string, number>;
  scars: Scar[];

  // 状态
  conditions: ConditionInstance[];
  resistances: Resistance[];

  // 战斗追踪
  reactionsUsed: number;
  inspirationDice?: number;
  menaceDice?: { die: DamageDie; current: number; max: number };
}
