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
} from './systems/DaggerHeartRules';
import type { Character } from '@trpgmaster/shared';
import type { CombatEnemy } from '@trpgmaster/shared';
import type {
  ActionDeclaration,
  AttackResolution,
  DamageResolution,
  RollDeclaration,
  RollResolution,
} from '@trpgmaster/shared';
import type { DamageSeverity } from '@trpgmaster/shared';

/** 玩家攻击敌人：掷骰判定命中 → 命中则掷武器伤害 → 敌人直接扣 HP */
export function resolvePlayerAttack(
  attacker: Character,
  enemy: CombatEnemy,
  decl: ActionDeclaration,
): AttackResolution {
  // 1) 攻击掷骰（客户端提供 or 后端代掷）
  const dice = decl.hopeDie != null && decl.fearDie != null
    ? { hopeDie: decl.hopeDie, fearDie: decl.fearDie }
    : rollDualD12();
  const modifier = traitModifier(attacker, decl.trait);
  const roll = resolveRoll(
    dice.hopeDie, dice.fearDie, modifier, decl.difficulty,
    decl.advantage ?? 0, decl.disadvantage ?? 0,
  );

  let damageRolled = 0;
  let hpLossToTarget = 0;

  if (roll.success) {
    // 2) 武器伤害；关键成功用 calculateCriticalDamage
    const w = attacker.mainWeapon;
    const dmg = roll.isCritical
      ? calculateCriticalDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).totalDamage
      : rollWeaponDamage(attacker.proficiency, w.damageDie, w.damageModifier ?? 0).total;
    damageRolled = dmg;
    // 敌人按 HP 直接结算
    hpLossToTarget = dmg;
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
    damageRolled,
    hpLossToTarget,
    severity: 'none',
    narrationHint: roll.success
      ? `攻击命中（${zhOutcome(roll.type)}），对${enemy.name}造成${damageRolled}点伤害。`
      : `攻击未命中（${zhOutcome(roll.type)}）。`,
  };
}

/** 对玩家角色施加伤害：原始伤害 → 严重度(用角色阈值) → 可选护甲降级 → HP 标记数 */
export function resolveDamageToCharacter(
  target: Character,
  rawDamage: number,
  spendArmorSlots: number = autoArmorPolicy(target, rawDamage),
): DamageResolution {
  const sevBefore = calculateDamageSeverity(
    rawDamage, target.minorThreshold, target.majorThreshold, target.severeThreshold,
  );
  const slots = Math.min(spendArmorSlots, target.armorSlots);
  const { newSeverity, slotsSpent } = applyArmorSlot(sevBefore, slots);
  const hpLoss = getHpLossFromSeverity(newSeverity);
  return {
    rawDamage,
    severityBeforeArmor: sevBefore,
    severityAfterArmor: newSeverity,
    armorSlotsSpent: slotsSpent,
    hpLoss,
    stressGain: 0,
    narrationHint: `${target.name}受到${zhSeverity(newSeverity)}伤害，失去${hpLoss}点生命${slotsSpent ? `（消耗${slotsSpent}护甲槽）` : ''}。`,
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
