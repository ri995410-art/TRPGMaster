/**
 * Card effect system — structured resolution for domain card effects
 *
 * Each domain card's effects are defined as structured CardEffect data.
 * This module resolves them deterministically, without relying on AI
 * interpretation of free-text descriptions.
 */

import type { CardEffect, DamageFormula, Character, CombatEnemy } from '@trpgmaster/shared';
import { rollDamageFormula, describeDamageFormula } from './damageFormula';

// ===== Card effect resolution =====

export interface CardEffectResult {
  /** Effect type */
  type: string;
  /** Target character/enemy ID */
  targetId?: string;
  /** HP change (positive = heal, negative = damage) */
  hpChange: number;
  /** Stress change (positive = damage, negative = relief) */
  stressChange: number;
  /** Hope cost paid */
  hopeCost: number;
  /** Advantage granted */
  advantageGranted: number;
  /** Disadvantage granted */
  disadvantageGranted: number;
  /** Condition applied */
  conditionApplied?: string;
  conditionDuration?: number;
  /** Human-readable description */
  narrationHint: string;
}

/**
 * Resolve a card effect against a target
 */
export function resolveCardEffect(
  effect: CardEffect,
  source: Character,
  target?: Character | CombatEnemy,
): CardEffectResult {
  const result: CardEffectResult = {
    type: effect.type,
    targetId: target ? target.id : undefined,
    hpChange: 0,
    stressChange: 0,
    hopeCost: effect.hopeCost ?? 0,
    advantageGranted: 0,
    disadvantageGranted: 0,
    narrationHint: '',
  };

  switch (effect.type) {
    case 'heal': {
      if (effect.formula && target && 'hp' in target) {
        const roll = rollDamageFormula(effect.formula);
        result.hpChange = roll.total;
        result.narrationHint = `${source.name}恢复${roll.total}点生命${effect.formula ? `（${describeDamageFormula(effect.formula)}）` : ''}。`;
      }
      if (effect.stressRelief) {
        result.stressChange = -effect.stressRelief;
        result.narrationHint += `清除${effect.stressRelief}点压力。`;
      }
      break;
    }

    case 'damage': {
      if (effect.formula) {
        const roll = rollDamageFormula(effect.formula);
        result.hpChange = -roll.total;
        result.narrationHint = `${source.name}造成${roll.total}点${effect.formula.type === 'magical' ? '魔法' : '物理'}伤害${effect.formula ? `（${describeDamageFormula(effect.formula)}）` : ''}。`;
      }
      if (effect.stressDamage) {
        result.stressChange = effect.stressDamage;
        result.narrationHint += `附加${effect.stressDamage}点压力。`;
      }
      break;
    }

    case 'buff': {
      result.advantageGranted = effect.advantageGranted ?? 1;
      result.narrationHint = `${source.name}获得${result.advantageGranted}个优势。`;
      break;
    }

    case 'debuff': {
      result.disadvantageGranted = effect.disadvantageGranted ?? 1;
      if (effect.conditionApplied) {
        result.conditionApplied = effect.conditionApplied;
        result.conditionDuration = effect.conditionDuration ?? 2;
        result.narrationHint = `${source.name}施加${effect.conditionApplied}状态${result.conditionDuration ? `（持续${result.conditionDuration}回合）` : ''}。`;
      } else {
        result.narrationHint = `${source.name}使目标获得${result.disadvantageGranted}个劣势。`;
      }
      break;
    }

    case 'move': {
      result.narrationHint = `${source.name}进行位移。`;
      break;
    }

    case 'summon': {
      result.narrationHint = `${source.name}召唤了一个实体。`;
      break;
    }

    case 'utility':
    default: {
      result.narrationHint = effect.description;
      break;
    }
  }

  return result;
}

/**
 * Get a card's total Hope cost (base cost + effect costs)
 */
export function getCardTotalHopeCost(effects: CardEffect[]): number {
  return effects.reduce((total, e) => total + (e.hopeCost ?? 0), 0);
}

/**
 * Check if any card effect requires a roll (damage or heal with dice)
 */
export function cardRequiresRoll(effects: CardEffect[]): boolean {
  return effects.some(e =>
    (e.type === 'damage' || e.type === 'heal') && e.formula && e.formula.dice.length > 0
  );
}
