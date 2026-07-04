/**
 * Enemy behavior engine — deterministic action selection based on enemy type and state
 *
 * Each enemy has a `behavior` type that determines its tactical priorities.
 * The engine selects the best action given the current combat state,
 * WITHOUT relying on AI improvisation.
 *
 * Behavior types:
 * - bruiser:  Prioritize attacking the nearest/focused target, use power attacks
 * - leader:   Command allies first, then attack; prefer fear traits that buff allies
 * - support:  Buff/heal allies, only attack when no support actions available
 * - solo:     Multi-action pattern: attack → special → attack
 * - ambusher: Attack vulnerable targets first, use fear to disengage when low HP
 * - caster:   Use ranged attacks, maintain distance, use fear for repositioning
 */

import type { CombatEnemy, Character } from '@trpgmaster/shared';
import type { EnemyAttack, EnemyFeature } from '@trpgmaster/shared';
import type { DamageFormula } from '@trpgmaster/shared';
import { rollDamageFormula, describeDamageFormula } from './damageFormula';

// ===== Action types the engine can select =====

export type EnemyActionKind =
  | 'attack'           // Standard attack from the enemy's attack list
  | 'useFearTrait'     // Use a fear-cost feature
  | 'useActionFeature' // Use a 0-cost action feature
  | 'focusTarget'      // Focus a specific enemy (GM action)
  | 'move';            // Reposition (narrative-only, no mechanical effect)

export interface EnemySelectedAction {
  kind: EnemyActionKind;
  /** Which attack from the stat block (index into attacks[]) */
  attackIndex?: number;
  /** Which feature from the stat block (index into features[]) */
  featureIndex?: number;
  /** Target character ID */
  targetId: string;
  /** Target type */
  targetType: 'player' | 'enemy';
  /** Human-readable description for AI narration */
  description: string;
  /** Whether this action costs Fear */
  fearCost: number;
  /** Pre-computed damage result (if attack) */
  damageResult?: { total: number; formula: DamageFormula; description: string };
  /** Stress damage (if any) */
  stressDamage?: number;
  /** Condition applied by this action */
  conditionApplied?: string;
  conditionDuration?: number;
}

export interface EnemyTurnResult {
  enemyId: string;
  enemyName: string;
  actions: EnemySelectedAction[];
  /** Compact summary for AI narration */
  narrationHint: string;
}

// ===== Behavior context (what the engine can see) =====

export interface BehaviorContext {
  enemy: CombatEnemy;
  players: Character[];
  allEnemies: CombatEnemy[];
  fearPoints: number;           // Current GM fear points
  currentFocus?: string;        // Currently focused player ID
  round: number;                // Current combat round
}

// ===== Core: select actions for an enemy turn =====

/**
 * Select actions for an enemy's turn based on behavior type and combat state.
 * Returns 1-2 actions (solo enemies may get more via fear spend).
 */
export function selectEnemyActions(ctx: BehaviorContext): EnemyTurnResult {
  const { enemy, players, fearPoints } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Find a valid target
  const target = selectTarget(ctx);
  if (!target) {
    return {
      enemyId: enemy.id,
      enemyName: enemy.name,
      actions: [],
      narrationHint: `${enemy.name}没有可攻击的目标。`,
    };
  }

  switch (enemy.behavior) {
    case 'bruiser':
      actions.push(...selectBruiserActions(ctx, target));
      break;
    case 'leader':
      actions.push(...selectLeaderActions(ctx, target));
      break;
    case 'support':
      actions.push(...selectSupportActions(ctx, target));
      break;
    case 'solo':
      actions.push(...selectSoloActions(ctx, target));
      break;
    case 'ambusher':
      actions.push(...selectAmbusherActions(ctx, target));
      break;
    case 'caster':
      actions.push(...selectCasterActions(ctx, target));
      break;
    default:
      // Fallback: basic attack
      actions.push(...selectBruiserActions(ctx, target));
  }

  const narrationHint = actions
    .map(a => a.description)
    .join('；');

  return {
    enemyId: enemy.id,
    enemyName: enemy.name,
    actions,
    narrationHint: narrationHint || `${enemy.name}无法行动。`,
  };
}

// ===== Target selection =====

function selectTarget(ctx: BehaviorContext): Character | null {
  const { players, currentFocus, enemy } = ctx;
  const alivePlayers = players.filter(p => p.hp > 0);
  if (alivePlayers.length === 0) return null;

  // Focused target first
  if (currentFocus) {
    const focused = alivePlayers.find(p => p.id === currentFocus);
    if (focused) return focused;
  }

  // Vulnerable targets (ambushers and bruisers prefer these)
  if (enemy.behavior === 'ambusher' || enemy.behavior === 'bruiser') {
    const vulnerable = alivePlayers.find(p =>
      p.conditions?.some(c => c.condition === 'vulnerable')
    );
    if (vulnerable) return vulnerable;
  }

  // Lowest HP target (casters and ambushers prefer weak targets)
  if (enemy.behavior === 'caster' || enemy.behavior === 'ambusher') {
    const weakest = alivePlayers.reduce((min, p) =>
      p.hp < min.hp ? p : min, alivePlayers[0]);
    if (weakest.hp <= 2) return weakest;
  }

  // Default: first alive player
  return alivePlayers[0];
}

// ===== Behavior-specific action selection =====

function selectBruiserActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Pick the highest-damage attack
  const attackIdx = selectBestAttack(enemy, 'maxDamage');
  if (attackIdx >= 0) {
    actions.push(buildAttackAction(enemy, attackIdx, target));
  }

  // If fear available and enemy has fear traits, consider using one
  if (fearPoints > 0) {
    const fearIdx = enemy.features.findIndex(f => f.type === 'fear' && f.cost <= fearPoints);
    if (fearIdx >= 0 && Math.random() < 0.4) { // 40% chance to spend fear
      actions.push(buildFearAction(enemy, fearIdx, target));
    }
  }

  return actions;
}

function selectLeaderActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints, allEnemies } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Leaders prefer to use fear traits that buff allies
  if (fearPoints > 0) {
    const fearIdx = enemy.features.findIndex(f =>
      f.type === 'fear' && f.cost <= fearPoints &&
      (f.description.includes('指挥') || f.description.includes('增益') || f.description.includes('强化'))
    );
    if (fearIdx >= 0) {
      actions.push(buildFearAction(enemy, fearIdx, target));
    }
  }

  // Then attack
  const attackIdx = selectBestAttack(enemy, 'first');
  if (attackIdx >= 0) {
    actions.push(buildAttackAction(enemy, attackIdx, target));
  }

  return actions;
}

function selectSupportActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints, allEnemies } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Support: prefer action features (buffs/heals) over attacks
  const actionFeatureIdx = enemy.features.findIndex(f =>
    f.type === 'action' && f.cost === 0 &&
    (f.description.includes('增益') || f.description.includes('治疗') || f.description.includes('恢复'))
  );

  if (actionFeatureIdx >= 0) {
    actions.push(buildActionFeatureAction(enemy, actionFeatureIdx, target));
  }

  // Then a basic attack
  const attackIdx = selectBestAttack(enemy, 'first');
  if (attackIdx >= 0) {
    actions.push(buildAttackAction(enemy, attackIdx, target));
  }

  return actions;
}

function selectSoloActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Solo enemies: primary attack first
  if (enemy.attacks.length > 0) {
    actions.push(buildAttackAction(enemy, 0, target));
  }

  // Use a special attack if available
  if (enemy.attacks.length > 1) {
    actions.push(buildAttackAction(enemy, 1, target));
  }

  // Spend fear for extra effects
  if (fearPoints >= 2) {
    const fearIdx = enemy.features.findIndex(f => f.type === 'fear' && f.cost <= fearPoints);
    if (fearIdx >= 0) {
      actions.push(buildFearAction(enemy, fearIdx, target));
    }
  }

  return actions;
}

function selectAmbusherActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Ambushers: attack with bonus-damage attack if target is vulnerable
  const vulnAttackIdx = enemy.attacks.findIndex(a => a.bonusDamageCondition);
  const targetVulnerable = target.conditions?.some(c => c.condition === 'vulnerable');

  if (vulnAttackIdx >= 0 && targetVulnerable) {
    actions.push(buildAttackAction(enemy, vulnAttackIdx, target, true));
  } else {
    const attackIdx = selectBestAttack(enemy, 'first');
    if (attackIdx >= 0) {
      actions.push(buildAttackAction(enemy, attackIdx, target));
    }
  }

  // If low HP, use fear to disengage
  if (enemy.currentHp <= enemy.maxHp / 3 && fearPoints > 0) {
    const disengageIdx = enemy.features.findIndex(f =>
      f.type === 'fear' && f.cost <= fearPoints &&
      (f.description.includes('脱离') || f.description.includes('脱战') || f.description.includes('撤退'))
    );
    if (disengageIdx >= 0) {
      actions.push(buildFearAction(enemy, disengageIdx, target));
    }
  }

  return actions;
}

function selectCasterActions(ctx: BehaviorContext, target: Character): EnemySelectedAction[] {
  const { enemy, fearPoints } = ctx;
  const actions: EnemySelectedAction[] = [];

  // Casters: prefer ranged/AoE attacks
  const rangedIdx = enemy.attacks.findIndex(a =>
    a.distance === 'far' || a.distance === 'close' || a.targets !== 'single'
  );
  if (rangedIdx >= 0) {
    actions.push(buildAttackAction(enemy, rangedIdx, target));
  } else if (enemy.attacks.length > 0) {
    actions.push(buildAttackAction(enemy, 0, target));
  }

  // Use fear for repositioning
  if (fearPoints > 0) {
    const repositionIdx = enemy.features.findIndex(f =>
      f.type === 'fear' && f.cost <= fearPoints &&
      (f.description.includes('移动') || f.description.includes('出现') || f.description.includes('传送'))
    );
    if (repositionIdx >= 0 && Math.random() < 0.3) {
      actions.push(buildFearAction(enemy, repositionIdx, target));
    }
  }

  return actions;
}

// ===== Attack selection strategies =====

type AttackStrategy = 'maxDamage' | 'minDamage' | 'first';

function selectBestAttack(enemy: CombatEnemy, strategy: AttackStrategy): number {
  if (enemy.attacks.length === 0) return -1;
  if (strategy === 'first') return 0;

  // Compare attacks by average damage
  let bestIdx = 0;
  let bestAvg = averageAttackDamage(enemy.attacks[0]);

  for (let i = 1; i < enemy.attacks.length; i++) {
    const avg = averageAttackDamage(enemy.attacks[i]);
    if (strategy === 'maxDamage' && avg > bestAvg) {
      bestAvg = avg;
      bestIdx = i;
    }
    if (strategy === 'minDamage' && avg < bestAvg) {
      bestAvg = avg;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function averageAttackDamage(attack: EnemyAttack): number {
  let avg = attack.damage.modifier;
  for (const d of attack.damage.dice) {
    avg += d.count * (d.sides + 1) / 2;
  }
  return avg;
}

// ===== Action builders =====

function buildAttackAction(
  enemy: CombatEnemy,
  attackIndex: number,
  target: Character,
  applyBonusDamage: boolean = false,
): EnemySelectedAction {
  const attack = enemy.attacks[attackIndex];
  const damageRoll = rollDamageFormula(attack.damage);
  let totalDamage = damageRoll.total;
  let dmgDesc = describeDamageFormula(attack.damage);

  // Rules: Ch4 "集群" — horde enemies deal hordeDamage instead of normal attack damage at half HP
  if (enemy.type === 'horde' && enemy.hordeDamage != null && enemy.currentHp <= Math.floor(enemy.maxHp / 2)) {
    totalDamage = enemy.hordeDamage;
    dmgDesc += `（集群半血伤害：${enemy.hordeDamage}）`;
  }

  // Apply bonus damage if condition met
  if (applyBonusDamage && attack.bonusDamage) {
    const bonusRoll = rollDamageFormula(attack.bonusDamage);
    totalDamage += bonusRoll.total;
    dmgDesc += `+${describeDamageFormula(attack.bonusDamage)}（${attack.bonusDamageCondition}）`;
  }

  return {
    kind: 'attack',
    attackIndex,
    targetId: target.id,
    targetType: 'player',
    description: `${enemy.name}对${target.name}使用"${attack.name}"，造成${totalDamage}点伤害${dmgDesc ? `（${dmgDesc}）` : ''}${attack.stressDamage ? `，附加${attack.stressDamage}点压力` : ''}${attack.conditionApplied ? `，施加${attack.conditionApplied}状态` : ''}。`,
    fearCost: 0,
    damageResult: {
      total: totalDamage,
      formula: attack.damage,
      description: dmgDesc,
    },
    stressDamage: attack.stressDamage,
    conditionApplied: attack.conditionApplied,
    conditionDuration: attack.conditionDuration,
  };
}

function buildFearAction(
  enemy: CombatEnemy,
  featureIndex: number,
  target: Character,
): EnemySelectedAction {
  const feature = enemy.features[featureIndex];
  return {
    kind: 'useFearTrait',
    featureIndex,
    targetId: target.id,
    targetType: 'player',
    description: `${enemy.name}花费${feature.cost}恐惧点使用"${feature.name}"：${feature.description}`,
    fearCost: feature.cost,
  };
}

function buildActionFeatureAction(
  enemy: CombatEnemy,
  featureIndex: number,
  target: Character,
): EnemySelectedAction {
  const feature = enemy.features[featureIndex];
  return {
    kind: 'useActionFeature',
    featureIndex,
    targetId: target.id,
    targetType: 'player',
    description: `${enemy.name}使用"${feature.name}"：${feature.description}`,
    fearCost: 0,
  };
}

// ===== Special enemy type mechanics =====

/**
 * Rules: Ch4 "无情" — enemy with relentlessCount can be focused multiple times per GM turn.
 * Returns whether the enemy can be focused again.
 */
export function canFocusEnemy(enemy: CombatEnemy): boolean {
  const maxFocus = enemy.relentlessCount ?? 1;
  const currentFocus = enemy.timesFocusedThisTurn ?? 0;
  return currentFocus < maxFocus;
}

/**
 * Rules: Ch4 "迟缓" — slow enemy's first focus does nothing;
 * it needs a second focus to actually act.
 * Returns whether the enemy can act after being focused.
 */
export function canActAfterFocus(enemy: CombatEnemy): boolean {
  if (!enemy.isSlow) return true;
  // Slow enemies need 2 focuses to act
  const focusCount = (enemy.timesFocusedThisTurn ?? 0) + 1;
  return focusCount >= 2;
}

/**
 * Focus an enemy: increment focus counter and return whether it can act.
 * Handles relentless and slow mechanics.
 */
export function focusEnemy(enemy: CombatEnemy): { canFocus: boolean; canAct: boolean } {
  if (!canFocusEnemy(enemy)) {
    return { canFocus: false, canAct: false };
  }
  const newFocusCount = (enemy.timesFocusedThisTurn ?? 0) + 1;
  enemy.timesFocusedThisTurn = newFocusCount;
  enemy.isFocused = true;

  const canAct = canActAfterFocus(enemy);
  return { canFocus: true, canAct };
}

/** Reset per-turn focus tracking (call at start of each GM turn) */
export function resetEnemyFocusTracking(enemy: CombatEnemy): void {
  enemy.timesFocusedThisTurn = 0;
  enemy.isFocused = false;
}
