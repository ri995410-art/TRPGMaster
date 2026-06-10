/**
 * DaggerHeart 完整规则引擎
 * 实现匕首之心核心机制：二元骰、伤害、希望/恐惧、等级、污染、派系
 */
import type {
  RollResultType,
  DamageSeverity,
  Attribute,
  CorruptionLevel,
} from '@trpgmaster/shared';
import type { Character } from '@trpgmaster/shared';

// ===== 二元骰系统 =====

export interface DualD12Result {
  hopeDie: number;
  fearDie: number;
  total: number;
}

export interface RollResultDetail {
  type: RollResultType;
  success: boolean;
  hopeGained: number;  // 玩家获得的希望点
  fearGained: number;  // GM获得的恐惧点
  stressCleared: number; // 清除的压力点
  extraDamage: boolean;  // 关键成功额外伤害
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
 * 判定掷骰结果
 */
export function determineRollResult(
  hopeDie: number,
  fearDie: number,
  modifier: number,
  difficulty: number,
): RollResultDetail {
  const total = hopeDie + fearDie + modifier;
  const isCritical = hopeDie === fearDie;
  const isSuccess = total >= difficulty;
  const hopeHigher = hopeDie > fearDie;

  // 关键成功：自动成功，无论难度
  if (isCritical) {
    return {
      type: 'criticalSuccess',
      success: true,
      hopeGained: 1,
      fearGained: 0,
      stressCleared: 1,
      extraDamage: true,
    };
  }

  if (isSuccess && hopeHigher) {
    return {
      type: 'hopeSuccess',
      success: true,
      hopeGained: 1,
      fearGained: 0,
      stressCleared: 0,
      extraDamage: false,
    };
  }

  if (isSuccess && !hopeHigher) {
    return {
      type: 'fearSuccess',
      success: true,
      hopeGained: 0,
      fearGained: 1,
      stressCleared: 0,
      extraDamage: false,
    };
  }

  if (!isSuccess && hopeHigher) {
    return {
      type: 'hopeFailure',
      success: false,
      hopeGained: 1,
      fearGained: 0,
      stressCleared: 0,
      extraDamage: false,
    };
  }

  // fearFailure
  return {
    type: 'fearFailure',
    success: false,
    hopeGained: 0,
    fearGained: 1,
    stressCleared: 0,
    extraDamage: false,
  };
}

// ===== 伤害系统 =====

/**
 * 计算伤害等级
 */
export function calculateDamageSeverity(
  damage: number,
  majorThreshold: number,
  severeThreshold: number,
): DamageSeverity {
  if (damage >= severeThreshold * 2) return 'massive';
  if (damage >= severeThreshold) return 'severe';
  if (damage >= majorThreshold) return 'major';
  return 'minor';
}

/**
 * 伤害等级对应的HP标记数
 */
export function calculateHpChange(severity: DamageSeverity): number {
  switch (severity) {
    case 'minor': return 1;
    case 'major': return 2;
    case 'severe': return 3;
    case 'critical': return 3; // deprecated alias for severe
    case 'massive': return 4;
  }
}

/**
 * 使用护甲槽降低伤害等级
 */
export function applyArmorSlot(severity: DamageSeverity): DamageSeverity | 'none' {
  switch (severity) {
    case 'massive': return 'severe';
    case 'severe': return 'major';
    case 'critical': return 'major'; // deprecated alias
    case 'major': return 'minor';
    case 'minor': return 'none';
  }
}

/**
 * 计算伤害阈值
 * 重度阈值 = 护甲基础重度 + 角色等级 + 调整值
 * 严重阈值 = 护甲基础严重 + 角色等级 + 调整值
 * 巨额阈值 = 严重阈值 × 2
 */
export function calculateThresholds(
  armorBase: number,
  armorBaseSevere: number,
  level: number,
  modifier: number = 0,
): { major: number; severe: number; massive?: number } {
  const major = armorBase + level + modifier;
  const severe = armorBaseSevere + level + modifier;
  const massive = severe * 2;
  return { major, severe, massive };
}

// ===== 关键成功伤害 =====

/**
 * 计算关键成功的额外伤害
 * 最高伤害骰值 + 正常伤害掷骰 + 调整值
 */
export function calculateCriticalDamage(
  proficiency: number,
  damageDie: number,
  modifier: number = 0,
): { maxDieValue: number; normalDamage: number; totalDamage: number } {
  // 掷正常伤害骰
  const rolls = Array.from({ length: proficiency }, () =>
    Math.floor(Math.random() * damageDie) + 1
  );
  const maxDieValue = damageDie; // 最高面值
  const normalDamage = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  const totalDamage = maxDieValue + normalDamage;
  return { maxDieValue, normalDamage, totalDamage };
}

// ===== 希望点/恐惧点系统 =====

interface HopeState {
  hope: number;
  maxHope: number;
}

/**
 * 消耗或获得希望点
 * Returns null if operation is invalid
 */
export function spendHope(state: HopeState, amount: number): HopeState | null {
  const newHope = state.hope - amount;

  // Cannot go below 0 or above max
  if (newHope < 0) return null;
  if (newHope > state.maxHope) return null;

  return { ...state, hope: newHope };
}

/**
 * 休整时GM获得恐惧点
 * 短休：1d4
 * 长休：玩家数 + 1d4
 */
export function gainFearOnRest(restType: 'short' | 'long', playerCount: number): number {
  const d4 = Math.floor(Math.random() * 4) + 1;
  if (restType === 'short') {
    return d4;
  }
  return playerCount + d4;
}

// ===== 等级/位阶系统 =====

/**
 * 根据等级获取位阶
 * 1级=位阶1, 2-4级=位阶2, 5-7级=位阶3, 8-10级=位阶4
 */
export function getTierFromLevel(level: number): number {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}

// ===== 升级系统 =====

export interface LevelUpBenefit {
  type: 'domainCard' | 'attributeBoost' | 'hpSlot' | 'stressSlot' | 'armorSlot' | 'experience' | 'proficiency' | 'subclassFeature';
  description: string;
}

/**
 * 升级时可选择的收益（每次升级选3项）
 */
export function getLevelUpOptions(level: number): LevelUpBenefit[] {
  const base: LevelUpBenefit[] = [
    { type: 'domainCard', description: '新领域卡（最多5张配置）' },
    { type: 'attributeBoost', description: '属性提升（+1）' },
    { type: 'hpSlot', description: '额外生命槽' },
    { type: 'stressSlot', description: '额外压力槽' },
    { type: 'armorSlot', description: '额外护甲槽' },
    { type: 'experience', description: '新经历' },
  ];

  // 特定等级额外收益
  if (level >= 2 && level <= 9) {
    base.push({ type: 'proficiency', description: '熟练值+1' });
  }

  return base;
}

/**
 * 升阶成就（2/5/8级）
 */
export function getTierUpBenefits(level: number): LevelUpBenefit[] {
  const benefits: LevelUpBenefit[] = [];

  if (level === 2 || level === 5 || level === 8) {
    benefits.push({ type: 'experience', description: '+1经历' });
    benefits.push({ type: 'proficiency', description: '熟练值+1' });
  }
  if (level === 5 || level === 8) {
    benefits.push({ type: 'attributeBoost', description: '清除属性标记' });
  }

  return benefits;
}

// ===== 优势/劣势d6骰系统 =====

/**
 * 计算净优势/劣势d6骰
 * 净优势 = advantageCount - disadvantageCount
 * 净>0：投1d6加到总数；净<0：投1d6从总数减去；净=0：无d6
 */
export function rollWithAdvantage(
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
  hopeGained: number;  // 反应掷骰不产生Hope（除非关键成功）
  fearGained: number;  // 反应掷骰不产生Fear
}

/**
 * 反应掷骰：使用二元d12但不产生Hope/Fear
 * Critical Success：自动成功但不清除压力/不获Hope
 */
export function determineReactionRollResult(
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
    hopeGained: 0, // 反应掷骰不产生Hope
    fearGained: 0, // 反应掷骰不产生Fear
  };
}

// ===== 压力→HP溢出级联 =====

export interface StressOverflowResult {
  stressApplied: number;
  hpOverflow: number;  // HP点数需要标记
  newStress: number;
  shouldApplyVulnerable: boolean;  // 标记最后压力槽时自动脆弱
}

/**
 * 应用压力，压力满时溢出标记HP
 * 每溢出1点压力→1点HP
 */
export function applyStressOverflow(
  currentStress: number,
  maxStress: number,
  stressAmount: number,
): StressOverflowResult {
  const newStress = currentStress + stressAmount;
  const shouldApplyVulnerable = newStress >= maxStress && currentStress < maxStress;

  if (newStress <= maxStress) {
    // 压力未溢出
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
    stressApplied: maxStress - currentStress, // 实际标记的压力
    hpOverflow: overflow, // 溢出标记的HP
    newStress: maxStress, // 压力封顶
    shouldApplyVulnerable: true,
  };
}

// ===== 压力满自动脆弱 =====

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

// ===== 抗性/免疫系统 =====

import type { DamageType as DmgType, Resistance } from '@trpgmaster/shared';

/**
 * 应用抗性/免疫到伤害
 * 抗性：伤害减半（向下取整）
 * 免疫：伤害归零
 */
export function applyResistance(
  damage: number,
  damageType: DmgType,
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

// ===== 休整行动（更新为官方规则） =====

export interface RestAction {
  name: string;
  description: string;
}

/**
 * 短休可选行动（选2项，GM获1d4恐惧）
 */
export function getShortRestActions(): RestAction[] {
  return [
    { name: '恢复生命', description: '恢复1d4+位阶生命点' },
    { name: '清除压力', description: '清除1d4+位阶压力点' },
    { name: '修复护甲', description: '清除所有护甲槽' },
    { name: '准备', description: '获得1希望点' },
    { name: '修理装备', description: '修理装备' },
    { name: '制作简单物品', description: '制作简单物品' },
  ];
}

/**
 * 长休可选行动（选2项，GM获1d4+玩家数恐惧）
 */
export function getLongRestActions(): RestAction[] {
  return [
    { name: '恢复所有生命', description: '恢复所有生命点' },
    { name: '清除所有压力', description: '清除所有压力点' },
    { name: '修复护甲', description: '修复护甲' },
    { name: '准备', description: '获得1希望点' },
    { name: '研究训练', description: '研究/训练/调查' },
    { name: '推进项目', description: '推进长期项目' },
    { name: '加强关系', description: '加强社交关系' },
    { name: '制作复杂物品', description: '制作复杂物品' },
    { name: '回想领域卡', description: '回想领域卡' },
  ];
}

// ===== 死亡行动 =====

export type DeathMoveType = 'gloriousSacrifice' | 'cheatDeath' | 'desperateGamble';

export interface DeathMoveResult {
  move: DeathMoveType;
  description: string;
  outcome: string;
}

/**
 * 光荣就义
 */
export function gloriousSacrifice(): DeathMoveResult {
  return {
    move: 'gloriousSacrifice',
    description: '接受死亡，执行一次关键成功的最后行动',
    outcome: '角色英勇谢幕，最后行动自动成功',
  };
}

/**
 * 回避死亡
 */
export function cheatDeath(level: number, hopeDie: number): DeathMoveResult {
  if (hopeDie <= level) {
    return {
      move: 'cheatDeath',
      description: '陷入昏迷，掷希望骰检验',
      outcome: `获得一道伤痕（永久失去1希望槽），恢复1生命点。希望骰${hopeDie} ≤ 等级${level}`,
    };
  }
  return {
    move: 'cheatDeath',
    description: '陷入昏迷，局势恶化',
    outcome: `恢复1生命点或长休后苏醒，局势恶化。希望骰${hopeDie} > 等级${level}，未获得伤痕`,
  };
}

/**
 * 孤注一掷
 */
export function desperateGamble(hopeDie: number, fearDie: number): DeathMoveResult {
  if (hopeDie === fearDie) {
    return {
      move: 'desperateGamble',
      description: '关键成功！',
      outcome: '恢复所有生命点和压力点',
    };
  }
  if (hopeDie > fearDie) {
    return {
      move: 'desperateGamble',
      description: '希望骰较高',
      outcome: `恢复${hopeDie}生命点/压力点`,
    };
  }
  return {
    move: 'desperateGamble',
    description: '恐惧骰较高',
    outcome: '角色死亡',
  };
}

// ===== 角色卡验证 =====

/**
 * 验证角色卡的合法性
 */
export function validateCharacterSheet(character: Partial<Character>): string[] {
  const errors: string[] = [];

  // HP validation
  if (character.hp !== undefined && character.maxHp !== undefined) {
    if (character.hp > character.maxHp) {
      errors.push('HP不能超过maxHp');
    }
    if (character.hp < 0) {
      errors.push('HP不能为负');
    }
  }

  // Hope validation
  if (character.hope !== undefined && character.maxHope !== undefined) {
    if (character.hope > character.maxHope) {
      errors.push('希望点不能超过maxHope');
    }
    if (character.maxHope > 6) {
      errors.push('希望点上限不能超过6');
    }
  }

  // Attribute validation
  if (character.attributes) {
    const attrValues = Object.values(character.attributes) as number[];
    const sum = attrValues.reduce((a: number, b: number) => a + b, 0);
    if (sum !== 3) { // +2,+1,+1,0,0,-1 = 3
      errors.push('属性调整值之和应为+3（+2,+1,+1,0,0,-1）');
    }

    // Check distribution
    const sorted = [...attrValues].sort((a: number, b: number) => b - a);
    const expectedDistribution = [2, 1, 1, 0, 0, -1];
    const matchesDistribution = sorted.every((v, i) => v === expectedDistribution[i]);
    if (!matchesDistribution) {
      errors.push('属性分配必须为+2,+1,+1,0,0,-1的排列');
    }
  }

  // Experience validation
  if (character.experiences) {
    if (character.experiences.length < 2) {
      errors.push('至少需要2个经历');
    }
    character.experiences.forEach(exp => {
      if (exp.modifier !== 2 && exp.modifier !== 1) {
        errors.push(`经历"${exp.name}"的调整值应为+2或+1`);
      }
    });
  }

  // Corruption validation
  if (character.corruption !== undefined) {
    if (character.corruption < 0 || character.corruption > 6) {
      errors.push('污染等级必须在0-6之间');
    }
  }

  return errors;
}

// ===== 群体行动/回音掷骰 =====

export interface GroupActionResult {
  totalParticipants: number;
  successes: number;
  failures: number;
  groupSuccess: boolean;  // 多数成功→群体成功
}

/**
 * 群体行动：多人掷骰，多数成功→群体成功
 */
export function resolveGroupAction(
  individualResults: boolean[],
): GroupActionResult {
  const successes = individualResults.filter(r => r).length;
  const failures = individualResults.filter(r => !r).length;
  const groupSuccess = successes > failures;

  return {
    totalParticipants: individualResults.length,
    successes,
    failures,
    groupSuccess,
  };
}

/**
 * 回音掷骰：花费3Hope，两角色各掷，选一个结果应用
 * 返回两个结果，由调用者选择使用哪个
 */
export function echoRoll(
  hopeDie1: number,
  fearDie1: number,
  modifier1: number,
  hopeDie2: number,
  fearDie2: number,
  modifier2: number,
  difficulty: number,
): { result1: RollResultDetail; result2: RollResultDetail; hopeCost: number } {
  const result1 = determineRollResult(hopeDie1, fearDie1, modifier1, difficulty);
  const result2 = determineRollResult(hopeDie2, fearDie2, modifier2, difficulty);
  return { result1, result2, hopeCost: 3 };
}

// ===== 德拉肯海姆特有机制 =====

type DrakkenheimZone = 'outer' | 'inner' | 'heavy';

export class DaggerHeartRules {
  /**
   * 验证污染等级合法性
   */
  validateCorruptionLevel(level: number): boolean {
    return Number.isInteger(level) && level >= 0 && level <= 6;
  }

  /**
   * 是否应抽取变异卡
   * 3级和5级时各抽一次
   */
  shouldDrawMutationCard(newLevel: number, previousLevel: number): boolean {
    // Crossed the 3 threshold
    if (previousLevel < 3 && newLevel >= 3) return true;
    // Crossed the 5 threshold
    if (previousLevel < 5 && newLevel >= 5) return true;
    return false;
  }

  /**
   * 污染是否达到终末（6级=异变）
   */
  isCorruptionTerminal(level: number): boolean {
    return level >= 6;
  }

  /**
   * 获取探险倒计时（根据区域类型）
   */
  getExplorationTimer(zone: DrakkenheimZone): number {
    switch (zone) {
      case 'outer': return 4;
      case 'inner': return 3;
      case 'heavy': return 2;
    }
  }

  /**
   * 验证派系关系等级
   */
  validateFactionRelation(level: number): boolean {
    return Number.isInteger(level) && level >= 1 && level <= 8;
  }

  /**
   * 获取派系关系标签
   */
  getFactionRelationLabel(level: number): string {
    if (level <= 2) return '敌对';
    if (level <= 4) return '不信任';
    if (level <= 6) return '友好';
    return '盟友';
  }

  /**
   * 污霭暴露反应难度
   */
  getHazeReactionDifficulty(zone: DrakkenheimZone): number {
    switch (zone) {
      case 'outer': return 12;
      case 'inner': return 14;
      case 'heavy': return 16;
    }
  }
}