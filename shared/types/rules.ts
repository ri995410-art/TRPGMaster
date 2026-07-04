// ===== 匕首之心 (Daggerheart) 规则类型 =====

import type { BaseRollOutcome } from './base';

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

// 基础状态（Daggerheart 规则书定义的所有条件）
export type BaseCondition =
  | 'blind'          // 失明：攻击劣势，依赖视觉的检定劣势
  | 'deafened'       // 失聪：无法听到，依赖听觉的检定劣势
  | 'hidden'         // 隐藏：对隐藏角色的攻击劣势
  | 'restrained'     // 束缚：敏捷检定劣势，攻击劣势
  | 'unconscious'    // 无意识：无法行动，攻击自动命中
  | 'surprised'      // 惊讶：第一轮无法行动，被攻击时优势
  | 'vulnerable'     // 脆弱：受到攻击时优势，受到的攻击伤害+1
  | 'poisoned'       // 中毒：Ch2 "状态" — 敏捷和力量检定劣势
  | 'ignited'        // 点燃：Ch2 "状态" — 每轮开始受到1点直接伤害
  | 'charmed'        // 魅惑：Ch2 "状态" — 对魅惑来源的风度检定劣势
  | 'intoxicated'    // 迷醉：Ch2 "状态" — 敏捷检定劣势
  | 'stunned'        // 震慑：Ch2 "状态" — 无法行动
  | 'dazed'          // 恍惚：Ch2 "状态" — 无法执行反应
  | 'corroded';      // 腐蚀：Ch2 "状态" — 护甲槽-1每轮

// 状态持续时间分类
export type ConditionDuration = 'temporary' | 'special' | 'permanent';

export interface ConditionInstance {
  condition: BaseCondition | string; // 允许特殊状态（如 'dying'）
  duration: ConditionDuration;
  source: string; // 来源描述
  clearCondition?: string; // 解除条件描述
  roundsRemaining?: number; // 临时状态的剩余回合
}

export const CONDITION_LABELS: Record<string, string> = {
  blind: '失明',
  deafened: '失聪',
  hidden: '隐藏',
  restrained: '束缚',
  unconscious: '无意识',
  surprised: '惊讶',
  vulnerable: '脆弱',
  dying: '濒死',
  // Rules: Ch2 "状态" — 7 additional condition types
  poisoned: '中毒',
  ignited: '点燃',
  charmed: '魅惑',
  intoxicated: '迷醉',
  stunned: '震慑',
  dazed: '恍惚',
  corroded: '腐蚀',
};

/** 条件的机械效果描述（供规则引擎读取） */
export interface ConditionEffect {
  /** 攻击此角色的敌人是否获得优势 */
  attackerAdvantage: boolean;
  /** 此角色攻击时是否劣势 */
  attackDisadvantage: boolean;
  /** 敏捷检定是否劣势 */
  agilityDisadvantage: boolean;
  /** 是否无法行动 */
  cannotAct: boolean;
  /** 是否无法移动 — Rules: Ch2 "束缚：无法移动" */
  cannotMove: boolean;
  /** 受到伤害时额外+HP标记数 */
  extraHpLoss: number;
  /** 自动被攻击命中 */
  autoHit: boolean;
  /** 是否无法执行反应 — Rules: Ch2 "恍惚" */
  cannotReact: boolean;
  /** 以此角色为目标的掷骰是否劣势 — Rules: Ch2 "隐藏" */
  targetDisadvantage?: boolean;
}

export const CONDITION_EFFECTS: Record<string, ConditionEffect> = {
  blind: { attackerAdvantage: false, attackDisadvantage: true, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  deafened: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "隐藏" — all dice targeting hidden character have disadvantage; attacker gains advantage
  hidden: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false, targetDisadvantage: true },
  // Rules: Ch2 "束缚" — cannot move; attacks targeting restrained have advantage (not attacker advantage + own disadvantage)
  restrained: { attackerAdvantage: true, attackDisadvantage: false, agilityDisadvantage: true, cannotAct: false, cannotMove: true, extraHpLoss: 0, autoHit: false, cannotReact: false },
  unconscious: { attackerAdvantage: true, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: true, cannotMove: false, extraHpLoss: 0, autoHit: true, cannotReact: false },
  surprised: { attackerAdvantage: true, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: true, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "脆弱" — all dice targeting you have advantage + extra 1 HP mark
  vulnerable: { attackerAdvantage: true, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 1, autoHit: false, cannotReact: false },
  dying: { attackerAdvantage: true, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: true, cannotMove: false, extraHpLoss: 0, autoHit: true, cannotReact: false },
  // Rules: Ch2 "状态" — 7 additional condition types
  // Rules: Ch2 "中毒" — agility and strength checks have disadvantage
  poisoned: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: true, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "点燃" — takes 1 direct damage at start of each round (handled by tickConditions)
  ignited: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "魅惑" — presence checks against charmer have disadvantage
  charmed: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "迷醉" — agility checks have disadvantage
  intoxicated: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: true, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "震慑" — cannot act
  stunned: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: true, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
  // Rules: Ch2 "恍惚" — cannot use reactions
  dazed: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: true },
  // Rules: Ch2 "腐蚀" — lose 1 armor slot each round (handled by tickConditions)
  corroded: { attackerAdvantage: false, attackDisadvantage: false, agilityDisadvantage: false, cannotAct: false, cannotMove: false, extraHpLoss: 0, autoHit: false, cannotReact: false },
};

/** 隐藏角色对其他角色的攻击是否有优势 */
export const HIDDEN_ATTACK_ADVANTAGE = true;

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

// 通用检定结果（跨系统通用）
export type RollOutcome = BaseRollOutcome;

// Daggerheart 二元骰结果类型（扩展通用结果）
export type RollResultType =
  | BaseRollOutcome
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
  stressCleared: number; // 关键成功时清除的压力点（0或1）
  canTakeFreeAction: boolean; // 关键成功时可执行免费行动
  advantageDice: number; // 优势骰数量
  disadvantageDice: number; // 劣势骰数量
}

export const ROLL_RESULT_LABELS: Record<RollResultType, string> = {
  success: '成功',
  failure: '失败',
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

// 伤害等级对应的生命点损失 — single source of truth
export const DAMAGE_SEVERITY_HP: Record<DamageSeverity, number> = {
  none: 0,
  minor: 1,
  major: 2,
  severe: 3,
} as const;

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
  /** Condition applied by the death move — Rules: Ch2 "回避死亡" applies unconscious */
  conditionApplied?: string;
  /** Stress gained (局势恶化) — Rules: Ch2 "回避死亡" non-scar path worsens situation */
  stressGained?: number;
  /** Fear gained by GM (局势恶化) */
  fearGained?: number;
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

// ===== 域卡效果系统 =====

export type CardEffectType =
  | 'heal'          // 恢复HP
  | 'damage'        // 造成伤害
  | 'buff'          // 给予优势/加值
  | 'debuff'        // 施加劣势/减值/条件
  | 'summon'        // 召唤实体
  | 'move'          // 移动角色
  | 'utility';      // 通用效果（叙事性，无直接机械效果）

export interface CardEffect {
  type: CardEffectType;
  /** 效果目标 */
  target: 'self' | 'ally' | 'enemy' | 'allEnemies' | 'allAllies';
  /** 伤害/治疗公式（damage/heal类型） */
  formula?: { dice: Array<{ count: number; sides: number }>; modifier: number; type: DamageType };
  /** 施加的条件（debuff类型） */
  conditionApplied?: string;
  conditionDuration?: number;
  /** 优势来源数（buff类型） */
  advantageGranted?: number;
  /** 劣势来源数（debuff类型） */
  disadvantageGranted?: number;
  /** 压力效果 */
  stressDamage?: number;
  stressRelief?: number;
  /** Hope消耗 */
  hopeCost?: number;
  /** 描述文本（用于AI叙述） */
  description: string;
}

// ===== 特性效果系统 =====

/** 特性触发时机 */
export type TraitTrigger =
  | 'always'              // 永久生效（如：额外HP槽、闪避加值）
  | 'onAttackHit'         // 攻击命中时
  | 'onDamaged'           // 受到伤害时
  | 'onRoll'              // 掷骰时（需配合 triggerAttribute / triggerSituation）
  | 'onFearResult'        // 掷出恐惧结果时
  | 'onHopeDie1'          // 希望骰结果为1时
  | 'onStressGained'      // 获得压力时
  | 'onRest'              // 休息时
  | 'onSessionStart'      // 游戏开始时
  | 'onDeathSave'         // 死亡豁免时
  | 'onEnemyAttack'       // 敌人攻击时（反应类）
  | 'onMove'              // 移动时
  | 'action';             // 主动使用（消耗 hope/stress 后触发）

/** 特性机械效果类型 */
export type TraitEffectType =
  | 'advantage'           // 特定检定获得优势
  | 'disadvantageIgnore'  // 忽略特定检定的劣势
  | 'reroll'              // 重掷（指定骰子类型）
  | 'damage'              // 造成伤害
  | 'damageReduction'     // 减少受到的伤害
  | 'hpLossReplace'       // 用其他资源替代HP损失
  | 'conditionApply'      // 施加条件
  | 'conditionResist'     // 获得抗性/免疫
  | 'resourceBonus'       // 角色创建时资源加值
  | 'thresholdBonus'      // 伤害阈值加值
  | 'evasionBonus'        // 闪避值加值
  | 'hopeGrant'           // 给予希望点
  | 'fearToHope'          // 恐惧结果改为希望结果
  | 'extraRestAction'     // 休息时额外行动
  | 'weaponExtension'     // 武器范围扩展
  | 'narrative';          // 纯叙事效果（无机械效果，AI描述）

/** 重掷目标骰 */
export type RerollTarget = 'hopeDie' | 'fearDie' | 'both' | 'attack';

export interface TraitEffect {
  /** 触发时机 */
  trigger: TraitTrigger;
  /** 效果类型 */
  type: TraitEffectType;
  /** 触发条件——属性（如：agility 表示敏捷检定） */
  triggerAttribute?: Attribute;
  /** 触发条件——情境描述（如：攀爬、恐吓、隐匿） */
  triggerSituation?: string;
  /** 伤害公式（damage 类型） */
  damageFormula?: { dice: Array<{ count: number; sides: number }>; modifier: number; type: DamageType };
  /** 伤害减少量（damageReduction 类型） */
  reductionAmount?: number;
  /** 替代HP损失的消耗（hpLossReplace 类型） */
  replaceCost?: { resource: 'stress'; amount: number };
  /** 施加的条件（conditionApply 类型） */
  conditionApplied?: string;
  conditionDuration?: number;
  /** 抗性类型（conditionResist 类型） */
  resistType?: DamageType;
  /** 资源加值（resourceBonus 类型） */
  resourceBonus?: { resource: 'hp' | 'stress' | 'hope'; amount: number };
  /** 阈值加值来源（thresholdBonus 类型） */
  thresholdBonusSource?: 'proficiency';
  /** 闪避加值（evasionBonus 类型） */
  evasionBonusAmount?: number;
  /** 希望点数（hopeGrant 类型） */
  hopeAmount?: number;
  /** hopeGrant 的目标 */
  hopeTarget?: 'self' | 'party';
  /** 重掷目标（reroll 类型） */
  rerollTarget?: RerollTarget;
  /** 每次休息/每场游戏使用次数限制 */
  usesPer?: 'shortRest' | 'longRest' | 'session';
  /** 武器范围扩展（weaponExtension 类型） */
  weaponRangeFrom?: string;
  weaponRangeTo?: string;
  /** 描述文本（用于AI叙述和UI展示） */
  description: string;
}

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
    mechanicalEffects?: TraitEffect[];
  };
  classFeature: {
    name: string;
    nameEn: string;
    description: string;
    usesPerRest?: 'shortRest' | 'longRest' | 'session';
    mechanicalEffects?: TraitEffect[];
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
  mechanicalEffects?: TraitEffect[];
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
  mechanicalEffects?: TraitEffect[];
}

// ===== 反应掷骰 =====

export interface ReactionRoll {
  attribute: Attribute;
  difficulty: number;
  result?: RollResult;
  success: boolean;
  description: string;
}

// ===== 反应系统 =====

export type ReactionTrigger =
  | 'onAttacked'
  | 'onEnemyMove'
  | 'onAllyDamaged'
  | 'onEnemyCast'
  | 'onDamageTaken';

export type ReactionType =
  | 'shieldBlock'
  | 'opportunityAttack'
  | 'traitReaction'
  | 'domainCardReaction'
  | 'uncannyDodge';

// ===== 优势/劣势 =====

export interface AdvantageState {
  advantageSources: string[];
  disadvantageSources: string[];
  net: number; // >0 = advantage, <0 = disadvantage; computed as advantageSources.length - disadvantageSources.length
}
