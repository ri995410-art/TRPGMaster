/**
 * Trait effect system — structured resolution for ancestry/community/class trait effects
 *
 * Each trait's effects are defined as structured TraitEffect data.
 * This module resolves them deterministically at the appropriate trigger points,
 * without relying on AI interpretation of free-text descriptions.
 */

import type {
  TraitEffect,
  TraitTrigger,
  Attribute,
  DamageType,
  Character,
  AncestryFeature,
  CommunityFeature,
} from '@trpgmaster/shared';
import type { ClassData } from '@trpgmaster/shared';
import { rollDamageFormula, describeDamageFormula } from './damageFormula';
import type { DamageFormula } from '@trpgmaster/shared';

// ===== Trait effect resolution =====

export interface TraitEffectResult {
  /** Source trait name */
  sourceName: string;
  /** Effect type */
  type: string;
  /** HP change (positive = heal, negative = damage) */
  hpChange: number;
  /** Stress change (positive = damage, negative = relief) */
  stressChange: number;
  /** Hope cost paid */
  hopeCost: number;
  /** Advantage granted */
  advantageGranted: number;
  /** Disadvantage ignored */
  disadvantageIgnored: number;
  /** Condition applied */
  conditionApplied?: string;
  conditionDuration?: number;
  /** Evasion bonus */
  evasionBonus: number;
  /** Damage reduction */
  damageReduction: number;
  /** Threshold bonus */
  thresholdBonus: number;
  /** Reroll available */
  rerollAvailable: boolean;
  rerollTarget?: string;
  /** Fear-to-hope conversion available */
  fearToHopeAvailable: boolean;
  /** Extra rest action available */
  extraRestAction: boolean;
  /** Human-readable description */
  narrationHint: string;
}

function emptyResult(sourceName: string): TraitEffectResult {
  return {
    sourceName,
    type: '',
    hpChange: 0,
    stressChange: 0,
    hopeCost: 0,
    advantageGranted: 0,
    disadvantageIgnored: 0,
    evasionBonus: 0,
    damageReduction: 0,
    thresholdBonus: 0,
    rerollAvailable: false,
    fearToHopeAvailable: false,
    extraRestAction: false,
    narrationHint: '',
  };
}

// ===== Trigger matching =====

export interface TriggerContext {
  /** What triggered this check */
  trigger: TraitTrigger;
  /** Attribute being used (if applicable) */
  attribute?: Attribute;
  /** Situation description (if applicable) */
  situation?: string;
  /** Current damage amount (for onDamaged) */
  damageAmount?: number;
  /** Damage type (for onDamaged) */
  damageType?: DamageType;
  /** Current HP (for conditional checks) */
  currentHp?: number;
  /** Current stress (for conditional checks) */
  currentStress?: number;
  /** Proficiency value (for threshold bonus) */
  proficiency?: number;
  /** Whether this is a short rest */
  isShortRest?: boolean;
  /** Whether this is a long rest */
  isLongRest?: boolean;
}

/**
 * Check if a trait effect's trigger matches the current context
 */
function triggerMatches(effect: TraitEffect, ctx: TriggerContext): boolean {
  if (effect.trigger !== ctx.trigger) return false;

  // Check attribute constraint
  if (effect.triggerAttribute && ctx.attribute) {
    if (effect.triggerAttribute !== ctx.attribute) return false;
  }

  // Check situation constraint — partial match on keywords
  if (effect.triggerSituation && ctx.situation) {
    const keywords = effect.triggerSituation.split(/[、，,]/);
    const situationLower = ctx.situation.toLowerCase();
    if (!keywords.some(kw => situationLower.includes(kw.trim().toLowerCase()))) {
      return false;
    }
  }

  return true;
}

// ===== Collect all trait effects for a character =====

export interface CharacterTraitSource {
  ancestryFeatures: AncestryFeature[];
  communityFeature: CommunityFeature | null;
  classData: ClassData | null;
}

/**
 * Collect all mechanical effects from a character's traits
 */
export function collectTraitEffects(source: CharacterTraitSource): Array<TraitEffect & { sourceName: string }> {
  const effects: Array<TraitEffect & { sourceName: string }> = [];

  for (const feature of source.ancestryFeatures) {
    if (feature.mechanicalEffects) {
      for (const effect of feature.mechanicalEffects) {
        effects.push({ ...effect, sourceName: feature.name });
      }
    }
  }

  if (source.communityFeature?.mechanicalEffects) {
    for (const effect of source.communityFeature.mechanicalEffects) {
      effects.push({ ...effect, sourceName: source.communityFeature.name });
    }
  }

  if (source.classData) {
    if (source.classData.hopeFeature.mechanicalEffects) {
      for (const effect of source.classData.hopeFeature.mechanicalEffects) {
        effects.push({ ...effect, sourceName: source.classData.hopeFeature.name });
      }
    }
    if (source.classData.classFeature.mechanicalEffects) {
      for (const effect of source.classData.classFeature.mechanicalEffects) {
        effects.push({ ...effect, sourceName: source.classData.classFeature.name });
      }
    }
  }

  return effects;
}

// ===== Resolve matching effects =====

/**
 * Find and resolve all trait effects that match a given trigger context
 */
export function resolveTraitEffects(
  allEffects: Array<TraitEffect & { sourceName: string }>,
  ctx: TriggerContext,
): TraitEffectResult[] {
  const results: TraitEffectResult[] = [];

  for (const effect of allEffects) {
    if (!triggerMatches(effect, ctx)) continue;

    const result = resolveSingleEffect(effect, ctx);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Resolve a single trait effect
 */
function resolveSingleEffect(
  effect: TraitEffect & { sourceName: string },
  ctx: TriggerContext,
): TraitEffectResult | null {
  const result = emptyResult(effect.sourceName);
  result.type = effect.type;

  switch (effect.type) {
    case 'advantage': {
      result.advantageGranted = 1;
      result.narrationHint = `${effect.sourceName}：${effect.description}`;
      break;
    }

    case 'disadvantageIgnore': {
      result.disadvantageIgnored = 1;
      result.narrationHint = `${effect.sourceName}：${effect.description}`;
      break;
    }

    case 'reroll': {
      result.rerollAvailable = true;
      result.rerollTarget = effect.rerollTarget;
      result.narrationHint = `${effect.sourceName}：${effect.description}`;
      break;
    }

    case 'damage': {
      if (effect.damageFormula) {
        const formula: DamageFormula = {
          dice: effect.damageFormula.dice.map(d => ({ count: d.count, sides: d.sides })),
          modifier: effect.damageFormula.modifier,
          type: effect.damageFormula.type,
        };
        const roll = rollDamageFormula(formula);
        result.hpChange = -roll.total;
        result.narrationHint = `${effect.sourceName}造成${roll.total}点${effect.damageFormula.type === 'magical' ? '魔法' : '物理'}伤害（${describeDamageFormula(formula)}）`;
      }
      break;
    }

    case 'damageReduction': {
      if (effect.resistType && ctx.damageType === effect.resistType) {
        // Halve the damage for resistance
        const reduced = ctx.damageAmount ? Math.floor(ctx.damageAmount / 2) : 0;
        result.damageReduction = reduced;
        result.narrationHint = `${effect.sourceName}：${effect.resistType === 'physical' ? '物理' : '魔法'}伤害减半，减少${reduced}点`;
      }
      break;
    }

    case 'hpLossReplace': {
      if (effect.replaceCost) {
        result.stressChange = effect.replaceCost.amount;
        result.hpChange = 1; // negate 1 HP loss
        result.narrationHint = `${effect.sourceName}：标记${effect.replaceCost.amount}压力代替1生命点损失`;
      }
      break;
    }

    case 'conditionApply': {
      result.conditionApplied = effect.conditionApplied;
      result.conditionDuration = effect.conditionDuration;
      result.narrationHint = `${effect.sourceName}：施加${effect.conditionApplied}状态${effect.conditionDuration ? `（持续${effect.conditionDuration}回合）` : ''}`;
      break;
    }

    case 'conditionResist': {
      if (effect.resistType) {
        result.narrationHint = `${effect.sourceName}：获得${effect.resistType === 'physical' ? '物理' : '魔法'}伤害抗性`;
      }
      break;
    }

    case 'resourceBonus': {
      if (effect.resourceBonus) {
        const { resource, amount } = effect.resourceBonus;
        if (resource === 'hp') result.hpChange = amount;
        else if (resource === 'stress') result.stressChange = -amount;
        result.narrationHint = `${effect.sourceName}：${resource === 'hp' ? '生命' : '压力'}槽+${amount}`;
      }
      break;
    }

    case 'thresholdBonus': {
      if (effect.thresholdBonusSource === 'proficiency' && ctx.proficiency) {
        result.thresholdBonus = ctx.proficiency;
        result.narrationHint = `${effect.sourceName}：伤害阈值+${ctx.proficiency}（熟练值）`;
      }
      break;
    }

    case 'evasionBonus': {
      result.evasionBonus = effect.evasionBonusAmount ?? 0;
      result.narrationHint = `${effect.sourceName}：闪避值+${result.evasionBonus}`;
      break;
    }

    case 'hopeGrant': {
      result.hpChange = 0;
      result.narrationHint = `${effect.sourceName}：${effect.hopeTarget === 'party' ? '全队' : '自身'}获得${effect.hopeAmount ?? 1}希望点`;
      break;
    }

    case 'fearToHope': {
      result.fearToHopeAvailable = true;
      result.narrationHint = `${effect.sourceName}：恐惧结果改为希望结果`;
      break;
    }

    case 'extraRestAction': {
      result.extraRestAction = true;
      result.narrationHint = `${effect.sourceName}：获得额外休整行动`;
      break;
    }

    case 'weaponExtension': {
      result.narrationHint = `${effect.sourceName}：${effect.weaponRangeFrom ?? '近战'}范围视为${effect.weaponRangeTo ?? '邻近'}范围`;
      break;
    }

    case 'narrative': {
      result.narrationHint = `${effect.sourceName}：${effect.description}`;
      break;
    }

    default: {
      return null;
    }
  }

  return result;
}

// ===== Convenience: get advantage sources for a roll =====

/**
 * Get all advantage sources from traits for a specific roll context
 */
export function getTraitAdvantageSources(
  allEffects: Array<TraitEffect & { sourceName: string }>,
  attribute: Attribute,
  situation?: string,
): string[] {
  const sources: string[] = [];
  const ctx: TriggerContext = { trigger: 'onRoll', attribute, situation };

  for (const effect of allEffects) {
    if (effect.type === 'advantage' && triggerMatches(effect, ctx)) {
      sources.push(effect.sourceName);
    }
  }

  return sources;
}

/**
 * Check if disadvantage should be ignored for a specific roll
 */
export function shouldIgnoreDisadvantage(
  allEffects: Array<TraitEffect & { sourceName: string }>,
  attribute: Attribute,
  situation?: string,
): boolean {
  const ctx: TriggerContext = { trigger: 'onRoll', attribute, situation };

  for (const effect of allEffects) {
    if (effect.type === 'disadvantageIgnore' && triggerMatches(effect, ctx)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all permanent resource bonuses from traits (for character creation)
 */
export function getPermanentResourceBonuses(
  allEffects: Array<TraitEffect & { sourceName: string }>,
): { hp: number; stress: number; hope: number; evasion: number; thresholdBonus: number } {
  const bonuses = { hp: 0, stress: 0, hope: 0, evasion: 0, thresholdBonus: 0 };

  for (const effect of allEffects) {
    if (effect.trigger !== 'always') continue;

    if (effect.type === 'resourceBonus' && effect.resourceBonus) {
      const { resource, amount } = effect.resourceBonus;
      if (resource === 'hp') bonuses.hp += amount;
      else if (resource === 'stress') bonuses.stress += amount;
      else if (resource === 'hope') bonuses.hope += amount;
    }

    if (effect.type === 'evasionBonus') {
      bonuses.evasion += effect.evasionBonusAmount ?? 0;
    }

    if (effect.type === 'thresholdBonus') {
      bonuses.thresholdBonus += 1; // actual value depends on proficiency
    }
  }

  return bonuses;
}
