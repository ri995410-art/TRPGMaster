/**
 * DaggerHeart 完整规则引擎
 * 实现匕首之心核心机制：二元骰、伤害阈值、希望/恐惧、压力、休整、死亡行动、升级、污染
 *
 * 对齐 shared/types 中的类型定义，移除已废弃的 massive/critical 伤害等级，
 * 更新阈值为 minor/major/severe，移除多人机制，新增单人战役相关规则。
 */
import type {
  RollResultType,
  RollResult,
  DamageSeverity,
  Attribute,
  Tier,
  DeathMoveType,
  DeathMoveResult,
  RestType,
  ShortRestAction,
  LongRestAction,
  RestResult,
  ConditionInstance,
  DamageType,
  DamageDie,
  Resistance,
  ContaminationLevel,
} from '@trpgmaster/shared';
import { DAMAGE_SEVERITY_HP, getTier } from '@trpgmaster/shared';
import type { Character } from '@trpgmaster/shared';

// ===== 二元骰系统 =====

export interface DualD12Result {
  hopeDie: number;
  fearDie: number;
  total: number;
}

/**
 * 掷二元骰 (2d12)
 */
export function rollDualD12(): DualD12Result {
  const hopeDie = Math.floor(Math.random() * 12) + 1;
  const fearDie = Math.floor(Math.random() * 12) + 1;
  return {
    hopeDie,
    fearDie,
    total: hopeDie + fearDie,
  };
}

/**
 * 判定掷骰结果（完整版，返回 RollResult）
 * 关键成功：双骰相同 → 自动成功
 * 希望成功：希望骰 > 恐惧骰 且 总和 ≥ 难度
 * 恐惧成功：恐惧骰 > 希望骰 且 总和 ≥ 难度
 * 希望失败：希望骰 > 恐惧骰 且 总和 < 难度
 * 恐惧失败：恐惧骰 > 希望骰 且 总和 < 难度
 */
export function resolveRoll(
  hopeDie: number,
  fearDie: number,
  modifier: number,
  difficulty: number,
  advantageCount: number = 0,
  disadvantageCount: number = 0,
): RollResult {
  const isCritical = hopeDie === fearDie;
  const baseTotal = hopeDie + fearDie + modifier;
  const hopeHigher = hopeDie > fearDie;

  // 处理优势/劣势 d6
  const { d6Result, finalTotal } = rollAdvantageDisadvantage(
    baseTotal,
    advantageCount,
    disadvantageCount,
  );

  const isSuccess = isCritical || finalTotal >= difficulty;

  let type: RollResultType;
  let hopeGained = 0;
  let fearGained = 0;

  if (isCritical) {
    // 关键成功：自动成功，无论难度
    type = 'criticalSuccess';
    hopeGained = 1;
    // 关键成功不产生恐惧
  } else if (isSuccess && hopeHigher) {
    type = 'hopeSuccess';
    hopeGained = 1;
  } else if (isSuccess && !hopeHigher) {
    type = 'fearSuccess';
    fearGained = 1;
  } else if (!isSuccess && hopeHigher) {
    type = 'hopeFailure';
    hopeGained = 1;
  } else {
    type = 'fearFailure';
    fearGained = 1;
  }

  return {
    type,
    hopeDie,
    fearDie,
    modifier,
    total: finalTotal,
    difficulty,
    success: isSuccess,
    hopeGained,
    fearGained,
    isCritical,
    advantageDice: advantageCount,
    disadvantageDice: disadvantageCount,
  };
}

/**
 * 优势/劣势 d6 骰处理
 * 净优势 > 0：投1d6加到总数
 * 净优势 < 0：投1d6从总数减去
 * 净优势 = 0：无d6
 */
export function rollAdvantageDisadvantage(
  baseTotal: number,
  advantageCount: number,
  disadvantageCount: number,
): { netAdvantage: number; d6Result: number | null; finalTotal: number } {
  const netAdvantage = advantageCount - disadvantageCount;
  let d6Result: number | null = null;
  let finalTotal = baseTotal;

  if (netAdvantage > 0) {
    d6Result = Math.floor(Math.random() * 6) + 1;
    finalTotal = baseTotal + d6Result;
  } else if (netAdvantage < 0) {
    d6Result = Math.floor(Math.random() * 6) + 1;
    finalTotal = baseTotal - d6Result;
  }

  return { netAdvantage, d6Result, finalTotal };
}

// ===== 反应掷骰系统 =====

export interface ReactionRollResult {
  hopeDie: number;
  fearDie: number;
  total: number;
  isCritical: boolean;
  success: boolean;
  hopeGained: number; // 反应掷骰不产生Hope（除非关键成功时清除1压力）
  fearGained: number; // 反应掷骰不产生Fear
}

/**
 * 反应掷骰：使用二元d12但不产生Hope/Fear
 * 关键成功：自动成功，清除1压力点
 */
export function resolveReactionRoll(
  hopeDie: number,
  fearDie: number,
  modifier: number,
  difficulty: number,
): ReactionRollResult {
  const total = hopeDie + fearDie + modifier;
  const isCritical = hopeDie === fearDie;
  const success = isCritical || total >= difficulty;

  return {
    hopeDie,
    fearDie,
    total,
    isCritical,
    success,
    hopeGained: 0,
    fearGained: 0,
  };
}

// ===== 伤害系统 =====

/**
 * 计算伤害阈值
 * 轻度阈值 = 护甲基础轻度 + 角色等级 + 调整值
 * 重度阈值 = 护甲基础重度 + 角色等级 + 调整值
 * 严重阈值 = 重度阈值 × 2
 */
export function calculateThresholds(
  armorBaseMinor: number,
  armorBaseMajor: number,
  level: number,
  modifiers: number = 0,
): { minor: number; major: number; severe: number } {
  const minor = armorBaseMinor + level + modifiers;
  const major = armorBaseMajor + level + modifiers;
  const severe = major * 2;
  return { minor, major, severe };
}

/**
 * 判定伤害等级
 * 使用新的 none/minor/major/severe 四级系统
 */
export function calculateDamageSeverity(
  damage: number,
  minorThreshold: number,
  majorThreshold: number,
  severeThreshold: number,
): DamageSeverity {
  if (damage >= severeThreshold) return 'severe';
  if (damage >= majorThreshold) return 'major';
  if (damage >= minorThreshold) return 'minor';
  if (damage > 0) return 'minor'; // 任何伤害至少为轻度
  return 'none';
}

/**
 * 伤害等级对应的HP标记数
 * 使用共享类型中的常量映射
 */
export function getHpLossFromSeverity(severity: DamageSeverity): number {
  return DAMAGE_SEVERITY_HP[severity];
}

/**
 * 使用护甲槽降低伤害等级
 * 每消耗1护甲槽降低1级伤害
 * 可多次使用，每级降低需要1护甲槽
 */
export function applyArmorSlot(
  severity: DamageSeverity,
  armorSlotsToSpend: number = 1,
): { newSeverity: DamageSeverity; slotsSpent: number } {
  const severityOrder: DamageSeverity[] = ['none', 'minor', 'major', 'severe'];
  const currentIndex = severityOrder.indexOf(severity);
  const newIndex = Math.max(0, currentIndex - armorSlotsToSpend);
  const actualSpent = currentIndex - newIndex;
  return {
    newSeverity: severityOrder[newIndex],
    slotsSpent: Math.max(0, actualSpent),
  };
}

/**
 * 计算关键成功的额外伤害
 * 最高伤害骰值 + 正常伤害掷骰 + 调整值
 */
export function calculateCriticalDamage(
  proficiency: number,
  damageDie: DamageDie,
  modifier: number = 0,
): { maxDieValue: number; normalDamage: number; totalDamage: number } {
  const dieSides = parseInt(damageDie.slice(1));
  const rolls = Array.from({ length: proficiency }, () =>
    Math.floor(Math.random() * dieSides) + 1,
  );
  const maxDieValue = dieSides;
  const normalDamage = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  const totalDamage = maxDieValue + normalDamage;
  return { maxDieValue, normalDamage, totalDamage };
}

/**
 * 计算武器伤害掷骰
 */
export function rollWeaponDamage(
  proficiency: number,
  damageDie: DamageDie,
  modifier: number = 0,
): { rolls: number[]; total: number } {
  const dieSides = parseInt(damageDie.slice(1));
  const rolls = Array.from({ length: proficiency }, () =>
    Math.floor(Math.random() * dieSides) + 1,
  );
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { rolls, total };
}

// ===== 希望点/恐惧点系统 =====

/**
 * 消耗希望点
 * 返回 null 如果希望点不足
 */
export function spendHope(
  currentHope: number,
  amount: number,
): number | null {
  const newHope = currentHope - amount;
  if (newHope < 0) return null;
  return newHope;
}

/**
 * 获得希望点（不超过上限）
 */
export function gainHope(
  currentHope: number,
  maxHope: number,
  amount: number,
): number {
  return Math.min(currentHope + amount, maxHope);
}

/**
 * GM获得恐惧点（休整时）
 * 短休：1d4
 * 长休：1d4（单人游戏，不再乘以玩家数）
 */
export function gainFearOnRest(restType: RestType): number {
  const d4 = Math.floor(Math.random() * 4) + 1;
  if (restType === 'short') return d4;
  return d4 + 2; // 长休：1d4 + 2（单人平衡）
}

// ===== 压力系统 =====

export interface StressOverflowResult {
  stressApplied: number;
  hpOverflow: number; // HP点数需要标记
  newStress: number;
  shouldApplyVulnerable: boolean; // 标记最后压力槽时自动脆弱
}

/**
 * 应用压力，压力满时溢出标记HP
 * 每溢出1点压力 → 1点HP
 */
export function applyStressOverflow(
  currentStress: number,
  maxStress: number,
  stressAmount: number,
): StressOverflowResult {
  const newStress = currentStress + stressAmount;
  const shouldApplyVulnerable = newStress >= maxStress && currentStress < maxStress;

  if (newStress <= maxStress) {
    return {
      stressApplied: stressAmount,
      hpOverflow: 0,
      newStress,
      shouldApplyVulnerable,
    };
  }

  // 压力溢出：超出的部分标记HP
  const overflow = newStress - maxStress;
  return {
    stressApplied: maxStress - currentStress,
    hpOverflow: overflow,
    newStress: maxStress,
    shouldApplyVulnerable: true,
  };
}

/**
 * 检查是否应施加脆弱状态
 * 当标记最后一个压力槽时自动变为脆弱
 */
export function shouldApplyVulnerableOnStress(
  currentStress: number,
  maxStress: number,
  stressToAdd: number,
): boolean {
  const newStress = currentStress + stressToAdd;
  return newStress >= maxStress && currentStress < maxStress;
}

/**
 * 清除压力点
 */
export function clearStress(
  currentStress: number,
  amount: number,
): number {
  return Math.max(0, currentStress - amount);
}

// ===== 休整系统 =====

/**
 * 短休可选行动（选2项）
 * 每项的具体效果依赖于位阶
 */
export function getShortRestActions(): { id: ShortRestAction; name: string; description: string }[] {
  return [
    { id: 'treatWounds', name: '处理伤口', description: '恢复1d4+位阶生命点' },
    { id: 'relieveStress', name: '缓解压力', description: '清除1d4+位阶压力点' },
    { id: 'repairArmor', name: '修理护甲', description: '清除1d4+位阶护甲槽' },
    { id: 'prepare', name: '做好准备', description: '获得1希望点' },
  ];
}

/**
 * 长休可选行动（选2项）
 */
export function getLongRestActions(): { id: LongRestAction; name: string; description: string }[] {
  return [
    { id: 'treatAllWounds', name: '处理所有伤口', description: '恢复所有生命点' },
    { id: 'relieveAllStress', name: '缓解所有压力', description: '清除所有压力点' },
    { id: 'repairAllArmor', name: '修理所有护甲', description: '清除所有护甲槽' },
    { id: 'prepareFully', name: '做好充分准备', description: '获得2希望点' },
    { id: 'advanceProject', name: '推进长期项目', description: '推进一个长期项目或研究' },
  ];
}

/**
 * 执行短休行动
 */
export function executeShortRestAction(
  action: ShortRestAction,
  character: Character,
): Partial<RestResult> {
  const tier = getTier(character.level);
  const d4 = Math.floor(Math.random() * 4) + 1;
  const tierBonus = tier;

  switch (action) {
    case 'treatWounds':
      return { hpRestored: d4 + tierBonus };
    case 'relieveStress':
      return { stressCleared: d4 + tierBonus };
    case 'repairArmor':
      return { armorSlotsCleared: d4 + tierBonus };
    case 'prepare':
      return { hopeGained: 1 };
  }
}

/**
 * 执行长休行动
 */
export function executeLongRestAction(
  action: LongRestAction,
  character: Character,
): Partial<RestResult> {
  switch (action) {
    case 'treatAllWounds':
      return { hpRestored: character.maxHp - character.hp };
    case 'relieveAllStress':
      return { stressCleared: character.stress };
    case 'repairAllArmor':
      return { armorSlotsCleared: character.armorSlots };
    case 'prepareFully':
      return { hopeGained: 2 };
    case 'advanceProject':
      return {}; // 叙事效果，无机械数值变化
  }
}

/**
 * 执行完整休整
 * 短休：选2项行动，两次短休间最多3次短休
 * 长休：选2项行动，重置短休计数
 */
export function executeRest(
  type: RestType,
  actions: (ShortRestAction | LongRestAction)[],
  character: Character,
  shortRestsSinceLong: number,
): RestResult & { newShortRestCount: number } {
  let hpRestored = 0;
  let stressCleared = 0;
  let armorSlotsCleared = 0;
  let hopeGained = 0;

  for (const action of actions) {
    if (type === 'short') {
      const result = executeShortRestAction(action as ShortRestAction, character);
      hpRestored += result.hpRestored ?? 0;
      stressCleared += result.stressCleared ?? 0;
      armorSlotsCleared += result.armorSlotsCleared ?? 0;
      hopeGained += result.hopeGained ?? 0;
    } else {
      const result = executeLongRestAction(action as LongRestAction, character);
      hpRestored += result.hpRestored ?? 0;
      stressCleared += result.stressCleared ?? 0;
      armorSlotsCleared += result.armorSlotsCleared ?? 0;
      hopeGained += result.hopeGained ?? 0;
    }
  }

  const fearGainedByGM = gainFearOnRest(type);
  const newShortRestCount = type === 'long' ? 0 : shortRestsSinceLong + 1;

  return {
    type,
    actions,
    hpRestored,
    stressCleared,
    armorSlotsCleared,
    hopeGained,
    fearGainedByGM,
    domainCardsSwapped: type === 'long', // 长休时可交换领域卡
    newShortRestCount,
  };
}

/**
 * 检查是否可以进行短休
 * 两次长休间最多3次短休
 */
export function canShortRest(shortRestsSinceLong: number): boolean {
  return shortRestsSinceLong < 3;
}

// ===== 死亡行动 =====

/**
 * 光荣就义
 * 角色英勇谢幕，执行一次关键成功的最后行动
 */
export function gloriousSacrifice(): DeathMoveResult {
  return {
    type: 'gloriousSacrifice',
    characterDied: true,
    hpRestored: 0,
    stressCleared: 0,
    scarGained: false,
    narrative: '角色接受命运，执行一次关键成功的最后行动后英勇谢幕。',
  };
}

/**
 * 回避死亡
 * 掷希望骰：≤等级 → 获得伤痕（永久失去1希望槽），恢复1生命点
 *           >等级 → 恢复1生命点或长休后苏醒，但局势恶化
 */
export function avoidDeath(level: number, hopeDie: number): DeathMoveResult {
  if (hopeDie <= level) {
    return {
      type: 'avoidDeath',
      characterDied: false,
      hpRestored: 1,
      stressCleared: 0,
      scarGained: true,
      narrative: `希望骰${hopeDie} ≤ 等级${level}，获得一道伤痕（永久失去1希望槽），恢复1生命点。`,
    };
  }
  return {
    type: 'avoidDeath',
    characterDied: false,
    hpRestored: 1,
    stressCleared: 0,
    scarGained: false,
    narrative: `希望骰${hopeDie} > 等级${level}，恢复1生命点，但局势恶化。`,
  };
}

/**
 * 孤注一掷
 * 掷二元骰：
 * 关键成功（双骰相同）→ 恢复所有生命点和压力点
 * 希望骰 > 恐惧骰 → 恢复希望骰值的生命点/压力点
 * 恐惧骰 > 希望骰 → 角色死亡
 */
export function desperateGamble(hopeDie: number, fearDie: number): DeathMoveResult {
  if (hopeDie === fearDie) {
    return {
      type: 'desperateGamble',
      characterDied: false,
      hpRestored: 999, // 恢复全部
      stressCleared: 999, // 恢复全部
      scarGained: false,
      narrative: '关键成功！恢复所有生命点和压力点。',
    };
  }
  if (hopeDie > fearDie) {
    return {
      type: 'desperateGamble',
      characterDied: false,
      hpRestored: hopeDie,
      stressCleared: hopeDie,
      scarGained: false,
      narrative: `希望骰(${hopeDie}) > 恐惧骰(${fearDie})，恢复${hopeDie}生命点和压力点。`,
    };
  }
  return {
    type: 'desperateGamble',
    characterDied: true,
    hpRestored: 0,
    stressCleared: 0,
    scarGained: false,
    narrative: `恐惧骰(${fearDie}) > 希望骰(${hopeDie})，角色死亡。`,
  };
}

// ===== 升级系统 =====

export interface LevelUpBenefit {
  type: 'domainCard' | 'attributeBoost' | 'hpSlot' | 'stressSlot' | 'armorSlot' | 'experience' | 'proficiency' | 'subclassFeature';
  description: string;
  mandatory?: boolean; // 升阶时自动获得的收益
}

/**
 * 升级时可选择的收益
 * 每次升级选择若干项（取决于等级）
 */
export function getLevelUpOptions(level: number): LevelUpBenefit[] {
  const base: LevelUpBenefit[] = [
    { type: 'domainCard', description: '新领域卡' },
    { type: 'attributeBoost', description: '属性提升（+1）' },
    { type: 'hpSlot', description: '额外生命槽' },
    { type: 'stressSlot', description: '额外压力槽' },
    { type: 'armorSlot', description: '额外护甲槽' },
    { type: 'experience', description: '新经历' },
  ];

  // 位阶2+ 可获得熟练值提升
  if (level >= 2 && level <= 9) {
    base.push({ type: 'proficiency', description: '熟练值+1' });
  }

  return base;
}

/**
 * 升阶成就（2/5/8级时触发）
 * 2级：+1经历，+1熟练值
 * 5级：+1经历，+1熟练值，清除属性标记
 * 8级：+1经历，+1熟练值，清除属性标记
 */
export function getTierUpBenefits(level: number): LevelUpBenefit[] {
  const benefits: LevelUpBenefit[] = [];

  if (level === 2 || level === 5 || level === 8) {
    benefits.push({ type: 'experience', description: '+1经历', mandatory: true });
    benefits.push({ type: 'proficiency', description: '熟练值+1', mandatory: true });
  }
  if (level === 5 || level === 8) {
    benefits.push({ type: 'attributeBoost', description: '清除所有属性标记（允许再次提升）', mandatory: true });
  }

  return benefits;
}

/**
 * 获取升级后的熟练值
 * 位阶1: 1, 位阶2: 2, 位阶3: 3, 位阶4: 4
 */
export function getProficiencyForTier(tier: Tier): number {
  return tier;
}

// ===== 抗性/免疫系统 =====

/**
 * 应用抗性/免疫到伤害
 * 抗性：伤害减半（向下取整）
 * 免疫：伤害归零
 */
export function applyResistance(
  damage: number,
  damageType: DamageType,
  resistances: Resistance[],
): { finalDamage: number; resisted: boolean; immune: boolean } {
  const matching = resistances.find(r => r.damageType === damageType);
  if (!matching) {
    return { finalDamage: damage, resisted: false, immune: false };
  }

  if (matching.mode === 'immunity') {
    return { finalDamage: 0, resisted: false, immune: true };
  }

  // resistance: half damage
  return { finalDamage: Math.floor(damage / 2), resisted: true, immune: false };
}

// ===== 状态管理 =====

/**
 * 添加状态到角色
 */
export function addCondition(
  conditions: ConditionInstance[],
  condition: ConditionInstance,
): ConditionInstance[] {
  // 检查是否已有相同状态
  const existing = conditions.find(c => c.condition === condition.condition);
  if (existing) {
    // 如果已有，更新持续时间（取较长者）
    if (condition.roundsRemaining !== undefined && existing.roundsRemaining !== undefined) {
      if (condition.roundsRemaining > existing.roundsRemaining) {
        return conditions.map(c =>
          c.condition === condition.condition ? condition : c,
        );
      }
    }
    return conditions;
  }
  return [...conditions, condition];
}

/**
 * 移除状态
 */
export function removeCondition(
  conditions: ConditionInstance[],
  conditionName: string,
): ConditionInstance[] {
  return conditions.filter(c => c.condition !== conditionName);
}

/**
 * 回合结束时更新临时状态
 * 返回过期的状态名列表
 */
export function tickConditions(
  conditions: ConditionInstance[],
): { updated: ConditionInstance[]; expired: string[] } {
  const expired: string[] = [];
  const updated: ConditionInstance[] = [];

  for (const cond of conditions) {
    if (cond.duration === 'temporary' && cond.roundsRemaining !== undefined) {
      const remaining = cond.roundsRemaining - 1;
      if (remaining <= 0) {
        expired.push(cond.condition);
      } else {
        updated.push({ ...cond, roundsRemaining: remaining });
      }
    } else {
      updated.push(cond);
    }
  }

  return { updated, expired };
}

/**
 * 检查角色是否有指定状态
 */
export function hasCondition(conditions: ConditionInstance[], conditionName: string): boolean {
  return conditions.some(c => c.condition === conditionName);
}

// ===== 领域卡系统 =====

/**
 * 回想领域卡：从宝库交换到配置
 * 花费闪电标记数 = 回想费用
 */
export function recallDomainCard(
  cardId: string,
  loadout: DomainCard[],
  vault: DomainCard[],
  availableRecallCost: number,
): { newLoadout: DomainCard[]; newVault: DomainCard[]; costPaid: number } | null {
  const cardInVault = vault.find(c => c.id === cardId);
  if (!cardInVault) return null;
  if (cardInVault.recallCost > availableRecallCost) return null;
  if (loadout.length >= 5) return null; // 配置已满

  const newVault = vault.filter(c => c.id !== cardId);
  const newLoadout = [...loadout, cardInVault];

  return {
    newLoadout,
    newVault,
    costPaid: cardInVault.recallCost,
  };
}

/**
 * 交换领域卡：配置中的一张与宝库中的一张互换
 */
export function swapDomainCard(
  loadoutCardId: string,
  vaultCardId: string,
  loadout: DomainCard[],
  vault: DomainCard[],
): { newLoadout: DomainCard[]; newVault: DomainCard[] } | null {
  const loadoutCard = loadout.find(c => c.id === loadoutCardId);
  const vaultCard = vault.find(c => c.id === vaultCardId);
  if (!loadoutCard || !vaultCard) return null;

  // 检查新卡的等级是否可用
  // （通常角色只能使用 ≤ 自身等级的领域卡）

  const newLoadout = loadout.map(c => c.id === loadoutCardId ? vaultCard : c);
  const newVault = vault.map(c => c.id === vaultCardId ? loadoutCard : c);

  return { newLoadout, newVault };
}

// 领域卡类型引用（从 character.ts 导入）
import type { DomainCard } from '@trpgmaster/shared';

// ===== 倒计时系统 =====

import type { Countdown } from '@trpgmaster/shared';

/**
 * 推进倒计时
 */
export function tickCountdown(countdown: Countdown): Countdown {
  if (countdown.triggered) return countdown;

  const newValue = countdown.currentValue - 1;
  const triggered = newValue <= countdown.triggerAt;

  return {
    ...countdown,
    currentValue: newValue,
    triggered,
  };
}

/**
 * 根据事件类型推进所有匹配的倒计时
 */
export function tickCountdowns(
  countdowns: Countdown[],
  triggerOn: Countdown['decrementOn'],
): { updated: Countdown[]; triggered: Countdown[] } {
  const triggered: Countdown[] = [];
  const updated = countdowns.map(cd => {
    if (cd.triggered || cd.decrementOn !== triggerOn) return cd;
    const newCd = tickCountdown(cd);
    if (newCd.triggered) triggered.push(newCd);
    return newCd;
  });
  return { updated, triggered };
}

// ===== 角色卡验证 =====

/**
 * 验证角色卡的合法性
 */
export function validateCharacterSheet(character: Partial<Character>): string[] {
  const errors: string[] = [];

  // HP 验证
  if (character.hp !== undefined && character.maxHp !== undefined) {
    if (character.hp > character.maxHp) {
      errors.push('HP不能超过maxHp');
    }
    if (character.hp < 0) {
      errors.push('HP不能为负');
    }
  }

  // 希望点验证
  if (character.hope !== undefined && character.maxHope !== undefined) {
    if (character.hope > character.maxHope) {
      errors.push('希望点不能超过maxHope');
    }
    if (character.maxHope > 6) {
      errors.push('希望点上限不能超过6');
    }
  }

  // 属性验证
  if (character.attributes) {
    const attrValues = Object.values(character.attributes) as number[];
    const sum = attrValues.reduce((a: number, b: number) => a + b, 0);
    if (sum !== 3) { // +2,+1,+1,0,0,-1 = 3
      errors.push('属性调整值之和应为+3（+2,+1,+1,0,0,-1）');
    }

    // 检查分布
    const sorted = [...attrValues].sort((a: number, b: number) => b - a);
    const expectedDistribution = [2, 1, 1, 0, 0, -1];
    const matchesDistribution = sorted.every((v, i) => v === expectedDistribution[i]);
    if (!matchesDistribution) {
      errors.push('属性分配必须为+2,+1,+1,0,0,-1的排列');
    }
  }

  // 经历验证
  if (character.experiences) {
    if (character.experiences.length < 2) {
      errors.push('至少需要2个经历');
    }
    character.experiences.forEach(exp => {
      if (exp.modifier < 1 || exp.modifier > 5) {
        errors.push(`经历"${exp.name}"的调整值应在+1到+5之间`);
      }
    });
  }

  // 领域卡配置验证
  if (character.domainCardConfig) {
    if (character.domainCardConfig.loadout.length > 5) {
      errors.push('配置中的领域卡不能超过5张');
    }
    character.domainCardConfig.loadout.forEach(card => {
      if (card.level > (character.level ?? 1)) {
        errors.push(`领域卡"${card.name}"的等级(${card.level})超过角色等级`);
      }
    });
  }

  return errors;
}

// ===== 德拉肯海姆特有机制 =====

type DrakkenheimZone = 'village' | 'outer' | 'inner' | 'heavy';

/**
 * 污染等级验证
 */
export function validateContaminationLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= 6;
}

/**
 * 污染是否达到终末（6级=异变）
 */
export function isContaminationTerminal(level: number): boolean {
  return level >= 6;
}

/**
 * 是否应抽取变异卡
 * 3级和5级时各抽一次
 */
export function shouldDrawMutationCard(
  newLevel: number,
  previousLevel: number,
): boolean {
  if (previousLevel < 3 && newLevel >= 3) return true;
  if (previousLevel < 5 && newLevel >= 5) return true;
  return false;
}

/**
 * 获取探险倒计时（根据区域类型）
 * 余烬村：无限制（安全区）
 * 外城：4回合
 * 内城：3回合
 * 重度迷雾区：2回合
 */
export function getExplorationTimer(zone: DrakkenheimZone): number {
  switch (zone) {
    case 'village': return Infinity;
    case 'outer': return 4;
    case 'inner': return 3;
    case 'heavy': return 2;
  }
}

/**
 * 污霭暴露反应难度
 */
export function getHazeReactionDifficulty(zone: DrakkenheimZone): number {
  switch (zone) {
    case 'village': return 0; // 无迷雾
    case 'outer': return 12;
    case 'inner': return 14;
    case 'heavy': return 16;
  }
}

/**
 * 污染暴露风险
 * 每次在迷雾区域失败掷骰时，根据区域增加污染
 */
export function getContaminationRisk(zone: DrakkenheimZone): number {
  switch (zone) {
    case 'village': return 0;
    case 'outer': return 1;
    case 'inner': return 2;
    case 'heavy': return 3;
  }
}

/**
 * 翠晶拾取污染风险
 */
export function getDeleriumContaminationRisk(
  deleriumType: 'fragment' | 'shard' | 'crystal' | 'vein',
): number {
  switch (deleriumType) {
    case 'fragment': return 1;
    case 'shard': return 2;
    case 'crystal': return 3;
    case 'vein': return 4;
  }
}

/**
 * 派系关系标签（与 shared/types/game.ts 对齐）
 * 1-2: 敌对, 3-4: 不友好, 5-6: 中立, 7-8: 友好, 9-10: 同盟
 */
export function getFactionRelationLabel(level: number): string {
  if (level <= 2) return '敌对';
  if (level <= 4) return '不友好';
  if (level <= 6) return '中立';
  if (level <= 8) return '友好';
  return '同盟';
}

/**
 * 派系关系等级变化
 * 返回新的关系值（1-10范围）
 */
export function changeFactionRelation(
  currentRelation: number,
  change: number,
): number {
  return Math.max(1, Math.min(10, currentRelation + change));
}

// ===== 闪避值系统 =====

/**
 * 计算角色闪避值
 * 基础值 + 敏捷调整值 - 护甲惩罚
 */
export function calculateEvasion(
  baseEvasion: number,
  agilityModifier: number,
  armorPenalty: number,
): number {
  return baseEvasion + agilityModifier - armorPenalty;
}

// ===== 辅助工具 =====

/**
 * 掷 N 面骰
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * 掷多个骰子
 */
export function rollDice(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => rollDie(sides));
}

/**
 * 解析伤害字符串（如 "2d8+3"）并掷骰
 */
export function rollDamageString(damageString: string): number {
  const match = damageString.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return 0;

  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3]) : 0;

  const rolls = rollDice(count, sides);
  return rolls.reduce((sum, r) => sum + r, 0) + modifier;
}

/**
 * 属性值 → 调整值映射
 * 1-4: -2, 5-8: -1, 9-12: 0, 13-16: +1, 17-20: +2, 21+: +3
 */
export function attributeToModifier(attributeValue: number): number {
  if (attributeValue <= 4) return -2;
  if (attributeValue <= 8) return -1;
  if (attributeValue <= 12) return 0;
  if (attributeValue <= 16) return 1;
  if (attributeValue <= 20) return 2;
  return 3;
}
