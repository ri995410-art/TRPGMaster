// DaggerHeart attribute types
export type Attribute = 'agility' | 'strength' | 'finesse' | 'instinct' | 'presence' | 'knowledge';

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  agility: '敏捷',
  strength: '力量',
  finesse: '灵巧',
  instinct: '本能',
  presence: '风度',
  knowledge: '知识',
};

// Damage types
export type DamageType = 'physical' | 'magical' | 'direct';

// Status conditions (expanded to match official rules)
export type Condition =
  | 'vulnerable'
  | 'restrained'
  | 'hidden'
  | 'enchanted'
  | 'poisoned'
  | 'stunned'
  | 'unconscious'
  | 'bleeding'
  | 'blinded'
  | 'deafened'
  | 'silenced'
  | 'paralyzed'
  | 'frozen'
  | 'burning';

export const CONDITION_LABELS: Record<Condition, string> = {
  vulnerable: '脆弱',
  restrained: '束缚',
  hidden: '隐匿',
  enchanted: '迷醉',
  poisoned: '中毒',
  stunned: '晕眩',
  unconscious: '昏迷',
  bleeding: '流血',
  blinded: '失明',
  deafened: '失聪',
  silenced: '沉默',
  paralyzed: '麻痹',
  frozen: '冰冻',
  burning: '燃烧',
};

// Distance ranges (official terminology)
export type Distance = 'melee' | 'nearby' | 'close' | 'far' | 'veryFar';

export const DISTANCE_LABELS: Record<Distance, string> = {
  melee: '近战',
  nearby: '邻近',
  close: '近距离',
  far: '远距离',
  veryFar: '极远',
};

// Difficulty levels
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

// Dice roll result types
export type RollResultType =
  | 'criticalSuccess'
  | 'hopeSuccess'
  | 'fearSuccess'
  | 'hopeFailure'
  | 'fearFailure';

export interface RollResult {
  type: RollResultType;
  hopeDie: number;
  fearDie: number;
  modifier: number;
  total: number;
  difficulty: number;
  success: boolean;
}

export const ROLL_RESULT_LABELS: Record<RollResultType, string> = {
  criticalSuccess: '关键成功',
  hopeSuccess: '希望成功',
  fearSuccess: '恐惧成功',
  hopeFailure: '希望失败',
  fearFailure: '恐惧失败',
};

// Damage severity (official: minor/major/severe/massive)
// 'critical' kept as deprecated alias for 'severe' during transition
export type DamageSeverity = 'minor' | 'major' | 'severe' | 'massive' | 'critical';

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: '轻度',
  major: '重度',
  severe: '严重',
  massive: '巨额',
  critical: '严重', // deprecated alias
};

// Rule system identifiers
export type RuleSystemId = 'daggerheart' | 'coc' | 'custom';

// Weapon load type (replaces WeaponHandedness)
export type WeaponLoad = 'oneHanded' | 'twoHanded' | 'offHand';

// Weapon handedness (deprecated, use WeaponLoad)
export type WeaponHandedness = 'oneHanded' | 'twoHanded';

// Weapon traits (official)
export type WeaponTrait =
  | 'reliable'    // 攻击掷骰+1
  | 'massive'     // 巨型：闪避-1，额外伤害骰取最高
  | 'heavy'       // 沉重：闪避-1
  | 'swift'       // 迅捷：标记1压力可攻击额外目标
  | 'cumbersome'  // 笨重：灵巧-1
  | 'nimble'      // 灵巧：闪避+1
  | 'versatile'   // 多用：可单手或双手使用不同伤害骰
  | 'fearsome'    // 可怖：攻击时目标标记1压力
  | 'pierce'      // 穿刺：忽略1点护甲阈值
  | 'sentinel'    // 哨卫：近战范围内盟友获得掩护
  | 'dual'        // 双持：主武器近战伤害+2
  | 'protect'     // 防御：护甲值+1
  | 'barricade'   // 屏障：护甲值+2，闪避-1
  | 'lash'        // 鞭挞：标记1压力，将近战敌人推至近距离
  | 'hook'        // 抓钩：成功攻击可将目标拉至近战范围
  | 'spellcasting'// 施法：可用于施法
  | 'returning'   // 回旋：投掷后自动返回
  | 'powerful'    // 强力：额外伤害骰取最高
  | 'parry';      // 招架：可用于格挡

export const WEAPON_TRAIT_LABELS: Record<WeaponTrait, string> = {
  reliable: '可靠',
  massive: '巨型',
  heavy: '沉重',
  swift: '迅捷',
  cumbersome: '笨重',
  nimble: '灵巧',
  versatile: '多用',
  fearsome: '可怖',
  pierce: '穿刺',
  sentinel: '哨卫',
  dual: '双持',
  protect: '防御',
  barricade: '屏障',
  lash: '鞭挞',
  hook: '抓钩',
  spellcasting: '施法',
  returning: '回旋',
  powerful: '强力',
  parry: '招架',
};

// Armor traits (official)
export type ArmorTrait = 'nimble' | 'heavy' | 'veryHeavy';

export const ARMOR_TRAIT_LABELS: Record<ArmorTrait, string> = {
  nimble: '灵巧',
  heavy: '沉重',
  veryHeavy: '极重',
};

// Weapon data (expanded with official fields)
export interface WeaponData {
  id: string;
  name: string;
  nameEn: string;
  attribute: Attribute;
  distance: Distance;
  damageDie: 'd4' | 'd6' | 'd8' | 'd10' | 'd12';
  damageModifier: number;
  handedness: WeaponHandedness; // deprecated, use load
  load: WeaponLoad;
  traits: WeaponTrait[];
  weaponTier?: number;
  description?: string;
}

// Armor data (expanded with official fields)
export interface ArmorData {
  id: string;
  name: string;
  nameEn: string;
  baseThreshold: number;       // 重度阈值基础
  baseThresholdSevere: number;  // 严重阈值基础
  armorSlots: number;
  evasionPenalty: number;       // 0, -1, or -2
  traits: ArmorTrait[];
  armorTier?: number;
  description?: string;
}

// Domain (magic school) types (expanded with song and nature)
export type DomainType =
  | 'arcane'
  | 'blade'
  | 'bone'
  | 'codex'
  | 'elegance'
  | 'midnight'
  | 'sage'
  | 'splendor'
  | 'valor'
  | 'song'
  | 'nature';

export const DOMAIN_LABELS: Record<DomainType, string> = {
  arcane: '奥术',
  blade: '利刃',
  bone: '骸骨',
  codex: '典籍',
  elegance: '优雅',
  midnight: '午夜',
  sage: '贤者',
  splendor: '辉耀',
  valor: '勇气',
  song: '歌谣',
  nature: '自然',
};

// Class data (expanded with official fields)
export interface ClassData {
  id: string;
  name: string;
  nameEn: string;
  domains: [DomainType, DomainType];
  baseEvasion: number;
  baseHp: number;
  baseStress: number;
  baseHope: number;
  hopeFeature: string;
  hopeFeatureCost: number;
  primaryAttribute: Attribute;
  subclassIds: [string, string];
}

// Subclass data
export interface SubclassData {
  id: string;
  name: string;
  nameEn: string;
  classId: string;
  level: number;
  castingAttribute: Attribute | null;
  description: string;
  feature?: string; // Subclass feature description
}
