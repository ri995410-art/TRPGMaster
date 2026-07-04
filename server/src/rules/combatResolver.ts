/**
 * Combat resolver — pure functions for Daggerheart combat resolution
 * All functions are deterministic (no StateManager side effects), easy to unit test.
 * Uses existing DaggerHeartRules primitives.
 */
import {
  resolveRoll,
  rollWeaponDamage,
  calculateCriticalDamage,
  calculateDamageSeverity,
  applyArmorSlot,
  getHpLossFromSeverity,
  rollDualD12,
  applyResistance,
} from './systems/DaggerHeartRules';
import type { Character } from '@trpgmaster/shared';
import type { CombatEnemy } from '@trpgmaster/shared';
import type {
  ActionDeclaration,
  AttackResolution,
  DamageResolution,
  RollDeclaration,
  RollResolution,
  EnemyAttackResolution,
} from '@trpgmaster/shared';
import type { DamageSeverity, DamageType } from '@trpgmaster/shared';
import { CONDITION_EFFECTS, HIDDEN_ATTACK_ADVANTAGE } from '@trpgmaster/shared';

/** 玩家攻击敌人：掷骰判定命中 → 命中则掷武器伤害 → 阈值比较 → 严重度 → HP标记数 */
export function resolvePlayerAttack(
  attacker: Character,
  enemy: CombatEnemy,
  decl: ActionDeclaration,
): AttackResolution {
  // Compute condition-based advantage/disadvantage
  let conditionAdvantage = decl.advantage ?? 0;
  let conditionDisadvantage = decl.disadvantage ?? 0;

  // Attacker is Hidden → advantage on attack
  if (attacker.conditions?.some(c => c.condition === 'hidden')) {
    conditionAdvantage += 1;
  }
  // Attacker is Blind or Restrained → disadvantage on attack
  if (attacker.conditions?.some(c => c.condition === 'blind' || c.condition === 'restrained')) {
    conditionDisadvantage += 1;
  }
  // Target is Restrained/Surprised/Vulnerable/Unconscious → attacker advantage
  const targetEffects = enemy.conditions.map(c => CONDITION_EFFECTS[c.condition]).filter(Boolean);
  if (targetEffects.some(e => e.attackerAdvantage)) {
    conditionAdvantage += 1;
  }
  // Rules: Ch2 "隐藏" — all dice targeting hidden character have disadvantage
  if (enemy.conditions.some(c => c.condition === 'hidden')) {
    conditionDisadvantage += 1;
  }

  // 1) 攻击掷骰（客户端提供 or 后端代掷）
  const dice = decl.hopeDie != null && decl.fearDie != null
    ? { hopeDie: decl.hopeDie, fearDie: decl.fearDie }
    : rollDualD12();
  const modifier = traitModifier(attacker, decl.trait);
  const roll = resolveRoll(
    dice.hopeDie, dice.fearDie, modifier, decl.difficulty,
    conditionAdvantage, conditionDisadvantage,
  );

  let damageRolled = 0;
  let hpLossToTarget = 0;
  let severity: DamageSeverity = 'none';
  let minionsExtraDefeated: number | undefined;

  if (roll.success) {
    // 2) 武器伤害；关键成功用 calculateCriticalDamage
    const w = attacker.mainWeapon;
    const dmg = roll.isCritical
      ? calculateCriticalDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).totalDamage
      : rollWeaponDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).total;
    damageRolled = dmg;
    // Vulnerable target: Rules Ch2 "状态" — +1 HP mark (consistent with CONDITION_EFFECTS.extraHpLoss)
    // This replaces the old inconsistent +1 raw damage
    const vulnExtraHp = enemy.conditions.some(c => c.condition === 'vulnerable') ? 1 : 0;

    // 3) 伤害结算：阈值→严重度→HP标记数
    const enemyType = enemy.type ?? 'elite';

    if (enemyType === 'minion') {
      // 杂兵路径：任何命中即败
      severity = 'minor';
      hpLossToTarget = enemy.maxHp; // 确保一次击败
      // 计算额外击败：每 minionDefeatThreshold 点伤害额外击败一个同类杂兵
      const defeatThreshold = enemy.minionDefeatThreshold ?? 3;
      const extraDefeated = Math.max(0, Math.floor(damageRolled / defeatThreshold) - 1);
      if (extraDefeated > 0) {
        minionsExtraDefeated = extraDefeated;
      }
    } else {
      // 非杂兵路径：阈值→严重度→HP标记数
      const major = enemy.majorThreshold;
      const severe = enemy.severeThreshold;

      if (major != null && severe != null) {
        // 使用敌人阈值
        severity = calculateDamageSeverity(damageRolled, 1, major, severe);
      } else {
        // 降级：基于maxHp推算阈值（向后兼容无阈值数据）
        const fallbackMajor = Math.ceil(enemy.maxHp * 0.5);
        const fallbackSevere = enemy.maxHp;
        severity = calculateDamageSeverity(damageRolled, Math.ceil(enemy.maxHp * 0.25), fallbackMajor, fallbackSevere);
      }
      hpLossToTarget = getHpLossFromSeverity(severity) + vulnExtraHp;
    }
  }

  return {
    outcome: roll.type,
    success: roll.success,
    isCritical: roll.isCritical,
    hopeDie: roll.hopeDie,
    fearDie: roll.fearDie,
    total: roll.total,
    difficulty: roll.difficulty,
    hopeGain: roll.hopeGained,
    fearGain: roll.fearGained,
    stressCleared: roll.stressCleared,
    canTakeFreeAction: roll.canTakeFreeAction,
    damageRolled,
    hpLossToTarget,
    severity,
    minionsExtraDefeated,
    // Rules: Ch2 "隐藏" — hidden condition clears after attacking
    hiddenAutoCleared: attacker.conditions?.some(c => c.condition === 'hidden') && roll.success,
    // Rules: Ch2 "掷骰结果总表" — fear success: target can mark 1 stress to react
    fearSuccessReactionAvailable: roll.type === 'fearSuccess',
    // Rules: Ch2 "施法掷骰" — hope success with cast intent: mark 1 stress to give 1 hope to ally
    hopeSuccessCastAvailable: roll.type === 'hopeSuccess',
    narrationHint: roll.success
      ? (enemy.type === 'minion'
        ? `攻击命中（${zhOutcome(roll.type)}），对杂兵${enemy.name}造成${damageRolled}点伤害，杂兵被击败${minionsExtraDefeated ? `，额外击败${minionsExtraDefeated}个同类杂兵` : ''}。`
        : `攻击命中（${zhOutcome(roll.type)}），对${enemy.name}造成${damageRolled}点伤害（${zhSeverity(severity)}，失去${hpLossToTarget}点生命）。`)
      : `攻击未命中（${zhOutcome(roll.type)}）。`,
  };
}

/** 对玩家角色施加伤害：原始伤害 → 严重度(用角色阈值) → 可选护甲降级 → HP 标记数
 *  Rules: Chapter 2 "伤害掷骰" — damage below minor threshold marks 1 stress instead of HP
 */
export function resolveDamageToCharacter(
  target: Character,
  rawDamage: number,
  spendArmorSlots: number = autoArmorPolicy(target, rawDamage),
  damageType?: import('@trpgmaster/shared').DamageType,
): DamageResolution {
  // Vulnerable condition: Rules Ch2 "状态" — all dice targeting you have advantage
  // Implementation: +1 HP mark (consistent extraHpLoss from CONDITION_EFFECTS)
  const isVulnerable = target.conditions?.some(c => c.condition === 'vulnerable') ?? false;
  const vulnExtra = isVulnerable ? 1 : 0;

  // Rules: Chapter 2 "伤害类型" — direct damage cannot be reduced by armor slots
  const isDirectDamage = damageType === 'direct';

  const sevBefore = calculateDamageSeverity(
    rawDamage, target.minorThreshold, target.majorThreshold, target.severeThreshold,
  );

  // Rules: damage below minor threshold → mark 1 stress instead of HP
  const isBelowThreshold = rawDamage > 0 && rawDamage < target.minorThreshold;

  let newSeverity: DamageSeverity;
  let slotsSpent: number;

  if (isDirectDamage) {
    // Direct damage: skip armor slot reduction entirely
    newSeverity = sevBefore;
    slotsSpent = 0;
  } else {
    const slots = Math.min(spendArmorSlots, target.armorSlots);
    const armorResult = applyArmorSlot(sevBefore, slots);
    newSeverity = armorResult.newSeverity;
    slotsSpent = armorResult.slotsSpent;
  }

  const hpLoss = isBelowThreshold ? 0 : (getHpLossFromSeverity(newSeverity) + vulnExtra);
  const stressGain = isBelowThreshold ? 1 : 0;

  return {
    rawDamage,
    severityBeforeArmor: sevBefore,
    severityAfterArmor: newSeverity,
    armorSlotsSpent: slotsSpent,
    hpLoss,
    stressGain,
    narrationHint: isBelowThreshold
      ? `${target.name}受到的伤害低于轻度阈值(${target.minorThreshold})，标记1点压力。`
      : `${target.name}受到${zhSeverity(newSeverity)}伤害，失去${hpLoss}点生命${slotsSpent ? `（消耗${slotsSpent}护甲槽）` : ''}${vulnExtra ? '（脆弱+1）' : ''}。`,
  };
}

/** 属性检定（行动掷骰）：玩家描述行动 + 选属性 → 后端掷骰 → 结算 hope/fear */
export function resolveAbilityCheck(
  character: Character,
  decl: RollDeclaration,
): RollResolution {
  const dice = rollDualD12();
  const modifier = decl.attribute
    ? (character.attributes as Record<string, number>)[decl.attribute] ?? 0
    : 0;
  const roll = resolveRoll(
    dice.hopeDie, dice.fearDie, modifier, decl.difficulty,
    decl.advantage ?? 0, decl.disadvantage ?? 0,
  );

  const attrLabel = decl.attribute ? `使用${decl.attribute}` : '无属性';

  return {
    outcome: roll.type,
    success: roll.success,
    isCritical: roll.isCritical,
    hopeDie: roll.hopeDie,
    fearDie: roll.fearDie,
    total: roll.total,
    difficulty: roll.difficulty,
    modifier,
    hopeGain: roll.hopeGained,
    fearGain: roll.fearGained,
    stressCleared: roll.stressCleared,
    canTakeFreeAction: roll.canTakeFreeAction,
    narrationHint: `${character.name}尝试"${decl.action}"（${attrLabel}，难度${decl.difficulty}）：${zhOutcome(roll.type)}（${roll.total} vs ${decl.difficulty}）${roll.isCritical ? '——关键成功！' : ''}`,
  };
}

// --- 辅助 ---

function traitModifier(c: Character, trait?: string): number {
  if (!trait) return 0;
  return (c.attributes as Record<string, number>)[trait] ?? 0;
}

function autoArmorPolicy(c: Character, raw: number): number {
  if (c.armorSlots <= 0) return 0;
  const sev = calculateDamageSeverity(raw, c.minorThreshold, c.majorThreshold, c.severeThreshold);
  return sev === 'major' || sev === 'severe' ? 1 : 0;
}

function zhOutcome(t: string): string {
  const map: Record<string, string> = {
    criticalSuccess: '关键成功',
    hopeSuccess: '希望成功',
    fearSuccess: '恐惧成功',
    hopeFailure: '希望失败',
    fearFailure: '恐惧失败',
  };
  return map[t] ?? t;
}

function zhSeverity(s: DamageSeverity): string {
  return { none: '无', minor: '轻度', major: '重度', severe: '严重' }[s];
}

// ===== 敌人攻击玩家 =====

/**
 * Resolve an enemy attacking a player character.
 * Rules reference: Chapter 3 "敌人攻击掷骰" — enemies roll d20 + attackModifier
 * vs target's evasion to determine hit.
 *
 * If the attack misses, no damage is applied.
 * If it hits, damage is rolled from the formula and converted
 * to severity using the player's thresholds.
 */
export function resolveEnemyAttack(
  enemy: { id: string; name: string; attackModifier?: number },
  target: Character,
  rawDamage: number,
  options?: {
    attackName?: string;
    stressDamage?: number;
    conditionApplied?: string;
    conditionDuration?: number;
    fearCost?: number;
    autoArmorSlots?: number;
    /** Override the d20 roll (for testing or client-provided rolls) */
    d20Override?: number;
    /** Damage type for resistance/direct damage checks */
    damageType?: DamageType;
  },
): EnemyAttackResolution {
  const attackName = options?.attackName ?? '攻击';
  const stressDamage = options?.stressDamage ?? 0;
  const fearCost = options?.fearCost ?? 0;

  // Rules: Chapter 3 "敌人攻击掷骰" — d20 + attackModifier vs target evasion
  // However, if the target is unconscious or dying, attacks automatically hit
  const targetConditions = target.conditions ?? [];
  const isAutoHit = targetConditions.some(c => c.condition === 'unconscious' || c.condition === 'dying');
  const attackMod = enemy.attackModifier ?? 0;
  const d20 = options?.d20Override ?? (Math.floor(Math.random() * 20) + 1);
  const attackTotal = d20 + attackMod;
  const targetEvasion = target.evasion;
  const attackHit = isAutoHit || attackTotal >= targetEvasion;

  // Fear success reaction: if d20 is odd (fear die behavior), target can mark 1 stress to react
  // Rules: Chapter 2 "掷骰结果总表" — 恐惧成功：目标可标记1压力进行反应
  // For enemy attacks, a hit with an odd d20 is treated as "with fear"
  const fearSuccessReactionAvailable = attackHit && d20 % 2 === 1;

  if (!attackHit) {
    // Attack missed — no damage applied
    return {
      enemyId: enemy.id,
      enemyName: enemy.name,
      attackName,
      targetId: target.id ?? '',
      attackRoll: d20,
      attackModifier: attackMod,
      attackTotal,
      targetEvasion,
      attackHit: false,
      rawDamage: 0,
      hpLoss: 0,
      severity: 'none',
      armorSlotsSpent: 0,
      stressDamage: 0,
      conditionApplied: undefined,
      conditionDuration: undefined,
      fearCost,
      fearSuccessReactionAvailable: false,
      narrationHint: `${enemy.name}对${target.name}使用"${attackName}"，攻击掷骰${d20}+${attackMod}=${attackTotal} vs 闪避${targetEvasion}，未命中。`,
    };
  }

  // Attack hit — apply resistance/immunity first
  // Rules: Chapter 2 "抗性与免疫" — resistance halves damage, immunity negates it
  const damageType = options?.damageType ?? 'physical';
  let effectiveDamage = rawDamage;
  let resisted = false;
  let immune = false;
  if (target.resistances && target.resistances.length > 0) {
    const resistResult = applyResistance(rawDamage, damageType, target.resistances);
    effectiveDamage = resistResult.finalDamage;
    resisted = resistResult.resisted;
    immune = resistResult.immune;
  }

  // Use resolveDamageToCharacter for consistent handling of:
  // - Direct damage (skip armor), - Vulnerable (+1 HP), - Below-threshold stress marking
  const damageResult = resolveDamageToCharacter(target, effectiveDamage, undefined, damageType);

  const hitType = d20 % 2 === 1 ? '（恐惧命中）' : '（希望命中）';
  const resistNote = immune ? '（免疫！）' : resisted ? '（抗性减半）' : '';
  const hint = immune
    ? `${enemy.name}对${target.name}使用"${attackName}"，攻击掷骰${d20}+${attackMod}=${attackTotal} vs 闪避${targetEvasion}，命中${hitType}，但${target.name}免疫${damageType}伤害。`
    : `${enemy.name}对${target.name}使用"${attackName}"，攻击掷骰${d20}+${attackMod}=${attackTotal} vs 闪避${targetEvasion}，命中${hitType}，造成${effectiveDamage}点伤害${resistNote}（${zhSeverity(damageResult.severityAfterArmor)}，失去${damageResult.hpLoss}点生命${damageResult.armorSlotsSpent ? `，消耗${damageResult.armorSlotsSpent}护甲槽` : ''}）${stressDamage ? `，附加${stressDamage}点压力` : ''}${options?.conditionApplied ? `，施加${options.conditionApplied}状态` : ''}${fearSuccessReactionAvailable ? '，目标可标记1压力进行反应' : ''}。`;

  return {
    enemyId: enemy.id,
    enemyName: enemy.name,
    attackName,
    targetId: target.id ?? '',
    attackRoll: d20,
    attackModifier: attackMod,
    attackTotal,
    targetEvasion,
    attackHit: true,
    rawDamage: effectiveDamage,
    hpLoss: damageResult.hpLoss,
    severity: damageResult.severityAfterArmor,
    armorSlotsSpent: damageResult.armorSlotsSpent,
    stressDamage: stressDamage + damageResult.stressGain,
    conditionApplied: options?.conditionApplied,
    conditionDuration: options?.conditionDuration,
    fearCost,
    fearSuccessReactionAvailable,
    narrationHint: hint,
  };
}
