// ===== 匕首之心 (Daggerheart) 规则类型 =====

// 六大属性
export type Attribute = 'agility' | 'strength' | 'finesse' | 'instinct' | 'presence' | 'knowledge';

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  agility: '敏捷',
  strength: '力量',
  finesse: '灵巧',
  instinct: '本能',
  presence: '风度',
  knowledge: '知识',
};

// 伤害类型
export type DamageType = 'physical' | 'magical' | 'direct';

// ===== 状态系统 =====

// 基础状态（三大核心状态）
export type BaseCondition = 'hidden' | 'restrained' | 'vulnerable';

// 状态持续时间分类
export type ConditionDuration = 'temporary' | 'special' | 'permanent';

export interface ConditionInstance {
  condition: BaseCondition | string; // 允许特殊状态
  duration: ConditionDuration;
  source: string; // 来源描述
  clearCondition?: string; // 解除条件描述
  roundsRemaining?: number; // 临时状态的剩余回合
}

export const CONDITION_LABELS: Record<string, string> = {
  hidden: '隐藏',
  restrained: '束缚',
  vulnerable: '脆弱',
};

// ===== 距离系统 =====

export type Distance = 'melee' | 'nearby' | 'close' | 'far' | 'veryFar' | 'outOfRange';

export const DISTANCE_LABELS: Record<Distance, string> = {
  melee: '近战',
  nearby: '邻近',
  close: '近距离',
  far: '远距离',
  veryFar: '极远',
  outOfRange: '超出范围',
};

// 格子距离映射（可选精确规则）
export const DISTANCE_SQUARES: Record<Distance, number> = {
  melee: 1,
  nearby: 3,
  close: 6,
  far: 12,
  veryFar: 13,
  outOfRange: Infinity,
};

// ===== 难度系统 =====

export interface DifficultyLevel {
  name: string;
  nameEn: string;
  value: number;
}

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  { name: '非常简单', nameEn: 'trivial', value: 5 },
  { name: '简单', nameEn: 'easy', value: 10 },
  { name: '普通', nameEn: 'moderate', value: 15 },
  { name: '困难', nameEn: 'hard', value: 20 },
  { name: '非常困难', nameEn: 'veryHard', value: 25 },
  { name: '几乎不可能', nameEn: 'nearlyImpossible', value: 30 },
];

// ===== 二元骰系统 =====

export type RollResultType =
  | 'criticalSuccess'  // 关键成功：双骰相同且总和≥难度
  | 'hopeSuccess'      // 希望成功：希望骰>恐惧骰，总和≥难度
  | 'fearSuccess'      // 恐惧成功：恐惧骰>希望骰，总和≥难度
  | 'hopeFailure'      // 希望失败：希望骰>恐惧骰，总和<难度
  | 'fearFailure';     // 恐惧失败：恐惧骰>希望骰，总和<难度

export interface RollResult {
  type: RollResultType;
  hopeDie: number;
  fearDie: number;
  modifier: number;
  total: number;
  difficulty: number;
  success: boolean;
  hopeGained: number;   // 玩家获得的希望点（0或1）
  fearGained: number;   // GM获得的恐惧点（0或1）
  isCritical: boolean;  // 是否关键成功
  advantageDice: number; // 优势骰数量
  disadvantageDice: number; // 劣势骰数量
}

export const ROLL_RESULT_LABELS: Record<RollResultType, string> = {
  criticalSuccess: '关键成功',
  hopeSuccess: '希望成功',
  fearSuccess: '恐惧成功',
  hopeFailure: '希望失败',
  fearFailure: '恐惧失败',
};

// ===== 伤害系统 =====

// 伤害等级（官方术语：无伤/轻度/重度/严重）
export type DamageSeverity = 'none' | 'minor' | 'major' | 'severe';

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  none: '无伤',
  minor: '轻度',
  major: '重度',
  severe: '严重',
};

// 伤害等级对应的生命点损失
export const DAMAGE_SEVERITY_HP: Record<DamageSeverity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  severe: 3,
};

// ===== 位阶系统 =====

export type Tier = 1 | 2 | 3 | 4;

export const TIER_LEVELS: Record<Tier, [number, number]> = {
  1: [1, 1],
  2: [2, 4],
  3: [5, 7],
  4: [8, 10],
};

export function getTier(level: number): Tier {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

// ===== 死亡行动 =====

export type DeathMoveType = 'gloriousSacrifice' | 'avoidDeath' | 'desperateGamble';

export interface DeathMoveResult {
  type: DeathMoveType;
  characterDied: boolean;
  hpRestored: number;
  stressCleared: number;
  scarGained: boolean;
  narrative: string;
}

export const DEATH_MOVE_LABELS: Record<DeathMoveType, string> = {
  gloriousSacrifice: '光荣就义',
  avoidDeath: '回避死亡',
  desperateGamble: '孤注一掷',
};

// ===== 休整系统 =====

export type RestType = 'short' | 'long';

export type ShortRestAction =
  | 'treatWounds'      // 处理伤口：恢复1d4+位阶生命点
  | 'relieveStress'    // 缓解压力：清除1d4+位阶压力点
  | 'repairArmor'      // 修理护甲：清除1d4+位阶护甲槽
  | 'prepare';         // 做好准备：获得1希望点（与队友一起则2点）

export type LongRestAction =
  | 'treatAllWounds'   // 处理所有伤口
  | 'relieveAllStress' // 缓解所有压力
  | 'repairAllArmor'   // 修理所有护甲
  | 'prepareFully'     // 做好充分准备
  | 'advanceProject';  // 推进长期项目

export interface RestResult {
  type: RestType;
  actions: (ShortRestAction | LongRestAction)[];
  hpRestored: number;
  stressCleared: number;
  armorSlotsCleared: number;
  hopeGained: number;
  fearGainedByGM: number; // 短休1d4，长休1d4+玩家数
  domainCardsSwapped: boolean;
}

// ===== 武器系统 =====

export type WeaponLoad = 'oneHanded' | 'twoHanded' | 'offHand';

export type WeaponTrait =
  | 'reliable' | 'massive' | 'heavy' | 'swift' | 'cumbersome'
  | 'nimble' | 'versatile' | 'fearsome' | 'pierce' | 'sentinel'
  | 'dual' | 'protect' | 'barricade' | 'lash' | 'hook'
  | 'spellcasting' | 'returning' | 'powerful' | 'parry';

export const WEAPON_TRAIT_LABELS: Record<WeaponTrait, string> = {
  reliable: '可靠', massive: '巨型', heavy: '沉重', swift: '迅捷',
  cumbersome: '笨重', nimble: '灵巧', versatile: '多用', fearsome: '可怖',
  pierce: '穿刺', sentinel: '哨卫', dual: '双持', protect: '防御',
  barricade: '屏障', lash: '鞭挞', hook: '抓钩', spellcasting: '施法',
  returning: '回旋', powerful: '强力', parry: '招架',
};

export type DamageDie = 'd4' | 'd6' | 'd8' | 'd10' | 'd12';

export interface WeaponData {
  id: string;
  name: string;
  nameEn: string;
  attribute: Attribute;
  distance: Distance;
  damageDie: DamageDie;
  damageModifier: number;
  load: WeaponLoad;
  traits: WeaponTrait[];
  weaponTier: number;
  description?: string;
}

// ===== 护甲系统 =====

export type ArmorTrait = 'nimble' | 'heavy' | 'veryHeavy';

export const ARMOR_TRAIT_LABELS: Record<ArmorTrait, string> = {
  nimble: '灵巧',
  heavy: '沉重',
  veryHeavy: '极重',
};

export interface ArmorData {
  id: string;
  name: string;
  nameEn: string;
  baseThreshold: number;        // 轻度伤害阈值基础值
  baseThresholdSevere: number;  // 重度伤害阈值基础值
  armorSlots: number;
  evasionPenalty: number;       // 闪避值惩罚 (0, -1, -2)
  traits: ArmorTrait[];
  armorTier: number;
  description?: string;
}

// ===== 领域系统 =====

export type DomainType =
  | 'arcane'    // 奥术
  | 'blade'     // 利刃
  | 'bone'      // 骸骨
  | 'codex'     // 典籍
  | 'elegance'  // 优雅
  | 'midnight'  // 午夜
  | 'sage'      // 贤者
  | 'splendor'  // 辉耀
  | 'valor';    // 勇气

export const DOMAIN_LABELS: Record<DomainType, string> = {
  arcane: '奥术', blade: '利刃', bone: '骸骨', codex: '典籍',
  elegance: '优雅', midnight: '午夜', sage: '贤者', splendor: '辉耀', valor: '勇气',
};

// ===== 职业系统 =====

export interface ClassData {
  id: string;
  name: string;
  nameEn: string;
  domains: [DomainType, DomainType];
  baseEvasion: number;
  baseHp: number;
  baseStress: number;
  hopeFeature: {
    name: string;
    nameEn: string;
    description: string;
    cost: number; // 通常为3希望点
  };
  classFeature: {
    name: string;
    nameEn: string;
    description: string;
    usesPerRest?: 'shortRest' | 'longRest' | 'session';
  };
  recommendedAttributes: Partial<Record<Attribute, number>>;
  recommendedWeapon: string;
  recommendedArmor: string;
  classItem: string;
  subclassIds: [string, string];
}

export interface SubclassData {
  id: string;
  name: string;
  nameEn: string;
  classId: string;
  castingAttribute: Attribute | null;
  description: string;
  backgroundQuestions: string[];
  relationshipQuestions: string[];
  features: {
    base: SubclassFeature;
    advanced: SubclassFeature;
    mastery: SubclassFeature;
  };
}

export interface SubclassFeature {
  name: string;
  nameEn: string;
  description: string;
  level: number;
  isCard: boolean; // 是否为卡牌形式
}

// ===== 种族系统 =====

export interface AncestryData {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  features: AncestryFeature[];
}

export interface AncestryFeature {
  name: string;
  nameEn: string;
  description: string;
  type: 'trait' | 'action' | 'passive';
  hopeCost?: number;
  stressCost?: number;
}

// ===== 社群系统 =====

export interface CommunityData {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  feature: CommunityFeature;
}

export interface CommunityFeature {
  name: string;
  nameEn: string;
  description: string;
  type: 'passive' | 'action';
  hopeCost?: number;
  stressCost?: number;
}

// ===== 反应掷骰 =====

export interface ReactionRoll {
  attribute: Attribute;
  difficulty: number;
  result?: RollResult;
  success: boolean;
  description: string;
}

// ===== 优势/劣势 =====

export interface AdvantageState {
  advantageSources: string[];
  disadvantageSources: string[];
  get net(): number; // >0 = 优势, <0 = 劣势
}
