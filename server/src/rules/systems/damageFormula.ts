/**
 * Damage formula system — structured, deterministic damage calculation
 *
 * Instead of parsing "2d8+3" strings with regex (fragile, error-prone),
 * damage formulas are pre-defined as structured objects:
 *   { dice: [{ count: 2, sides: 8 }], modifier: 3, type: 'magical' }
 *
 * This module provides:
 * 1. `rollDamageFormula` — execute a formula and get deterministic results
 * 2. `rollDamageDice` — roll a single dice component
 * 3. `maxDamageFormula` — calculate the maximum possible damage (for preview/tooltip)
 * 4. `averageDamageFormula` — calculate average expected damage
 * 5. `describeDamageFormula` — human-readable string like "2d8+3 魔法伤害"
 */

import type { DamageFormula, DamageDiceComponent, DamageType } from '@trpgmaster/shared';

// ===== Result types =====

export interface DamageRollResult {
  /** Each dice group's individual rolls */
  diceResults: Array<{ count: number; sides: number; rolls: number[]; subtotal: number }>;
  /** Total from all dice */
  diceTotal: number;
  /** Fixed modifier */
  modifier: number;
  /** Final damage total */
  total: number;
  /** Damage type */
  type: DamageType;
}

// ===== Core functions =====

/** Roll a single dice component (e.g., 2d8 → [5, 3]) */
export function rollDamageDice(component: DamageDiceComponent): { rolls: number[]; total: number } {
  const rolls: number[] = [];
  for (let i = 0; i < component.count; i++) {
    rolls.push(Math.floor(Math.random() * component.sides) + 1);
  }
  return { rolls, total: rolls.reduce((sum, r) => sum + r, 0) };
}

/** Execute a damage formula and return detailed results */
export function rollDamageFormula(formula: DamageFormula): DamageRollResult {
  const diceResults: DamageRollResult['diceResults'] = [];
  let diceTotal = 0;

  for (const component of formula.dice) {
    const { rolls, total } = rollDamageDice(component);
    diceResults.push({
      count: component.count,
      sides: component.sides,
      rolls,
      subtotal: total,
    });
    diceTotal += total;
  }

  const total = diceTotal + formula.modifier;

  return {
    diceResults,
    diceTotal,
    modifier: formula.modifier,
    total,
    type: formula.type,
  };
}

/** Calculate the maximum possible damage from a formula */
export function maxDamageFormula(formula: DamageFormula): number {
  let maxDice = 0;
  for (const component of formula.dice) {
    maxDice += component.count * component.sides;
  }
  return maxDice + formula.modifier;
}

/** Calculate the average expected damage from a formula */
export function averageDamageFormula(formula: DamageFormula): number {
  let avgDice = 0;
  for (const component of formula.dice) {
    avgDice += component.count * (component.sides + 1) / 2;
  }
  return Math.floor(avgDice + formula.modifier);
}

/** Human-readable description of a damage formula */
export function describeDamageFormula(formula: DamageFormula): string {
  const diceStr = formula.dice
    .map(d => d.count > 1 ? `${d.count}d${d.sides}` : `d${d.sides}`)
    .join('+');

  const modStr = formula.modifier > 0 ? `+${formula.modifier}` : formula.modifier < 0 ? `${formula.modifier}` : '';

  const typeLabel: Record<DamageType, string> = {
    physical: '物理',
    magical: '魔法',
    direct: '直接',
  };

  const parts = [diceStr, modStr].filter(Boolean);
  return `${parts.join('')}${formula.dice.length > 0 || formula.modifier !== 0 ? ` ${typeLabel[formula.type]}伤害` : ''}`;
}

/** Create a simple formula from a common dice notation (used only for migration/ad-hoc) */
export function createDamageFormula(
  count: number,
  sides: number,
  modifier: number = 0,
  type: DamageType = 'physical',
): DamageFormula {
  return {
    dice: count > 0 ? [{ count, sides }] : [],
    modifier,
    type,
  };
}
