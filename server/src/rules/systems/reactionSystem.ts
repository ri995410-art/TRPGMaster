/**
 * Reaction system — structured reaction triggers and resolution for Daggerheart.
 *
 * Design: reactions are declared after a trigger event and resolved before
 * the original action continues. The server emits a reaction prompt, the
 * client responds with a declaration, and the system resolves mechanically.
 *
 * Rules engine drives the numbers; AI only narrates.
 */
import {
  resolveReactionRoll,
  calculateDamageSeverity,
  applyArmorSlot,
  getHpLossFromSeverity,
} from './DaggerHeartRules';
import type { Character, CombatEnemy, Attribute } from '@trpgmaster/shared';
import type { DamageSeverity } from '@trpgmaster/shared';

// ===== Types =====

/** Events that can trigger a reaction */
export type ReactionTrigger =
  | 'onAttacked'       // Character is targeted by an attack
  | 'onEnemyMove'      // An enemy moves away from or past the character
  | 'onAllyDamaged'    // An ally in range takes damage
  | 'onEnemyCast'      // An enemy casts a spell / uses a domain-card-like ability
  | 'onDamageTaken';   // After damage is actually applied (for damage reduction traits)

/** Kinds of reactions a character can declare */
export type ReactionType =
  | 'shieldBlock'        // Spend armor slot to reduce damage severity
  | 'opportunityAttack'  // Melee attack when enemy moves away
  | 'traitReaction'      // Ancestry / class / community trait reaction
  | 'domainCardReaction' // Domain card used as a reaction
  | 'uncannyDodge';      // Reaction roll to avoid / reduce an attack (for traits like Elven Quick Reflexes)

/** Context that describes why a reaction prompt was generated */
export interface ReactionContext {
  trigger: ReactionTrigger;
  /** Who triggered the event (enemy id or 'gm') */
  sourceId: string;
  sourceType: 'enemy' | 'gm' | 'environment';
  /** Who the trigger targets (player character id) */
  targetId: string;
  /** For attacks: raw damage before severity conversion */
  rawDamage?: number;
  /** For attacks: severity before reactions */
  severity?: DamageSeverity;
  /** For attacks: the attack name */
  attackName?: string;
  /** For enemy move: where the enemy is moving */
  moveDescription?: string;
  /** For spell cast: spell/ability name */
  abilityName?: string;
  /** Ally that was damaged (onAllyDamaged) */
  allyId?: string;
  /** Round number for tracking */
  round: number;
}

/** A single available reaction option for the player */
export interface ReactionOption {
  type: ReactionType;
  /** Human-readable name */
  name: string;
  /** Short description of what it does */
  description: string;
  /** Attribute used for the reaction roll, if any */
  attribute?: Attribute;
  /** Difficulty for the reaction roll */
  difficulty?: number;
  /** Cost in hope points */
  hopeCost?: number;
  /** Whether this consumes the character's one reaction per round */
  usesReaction: boolean;
  /** Trait or feature that provides this reaction */
  sourceId?: string;
  sourceType?: 'ancestry' | 'class' | 'community' | 'domainCard';
}

/** Player's declaration of which reaction to use */
export interface ReactionDeclaration {
  type: ReactionType;
  /** Dice values if a roll is needed (client-rolled) */
  hopeDie?: number;
  fearDie?: number;
  /** For shieldBlock: how many armor slots to spend */
  armorSlotsToSpend?: number;
  /** Source trait/feature ID */
  sourceId?: string;
}

/** Result of resolving a reaction */
export interface ReactionResolution {
  type: ReactionType;
  success: boolean;
  isCritical: boolean;
  /** Damage prevented / reduced (for shieldBlock, uncannyDodge) */
  damagePrevented: number;
  /** New severity after reaction (for shieldBlock) */
  newSeverity?: DamageSeverity;
  /** Armor slots spent */
  armorSlotsSpent: number;
  /** Counter-attack damage dealt (for opportunityAttack) */
  counterDamage?: number;
  /** HP loss to the triggering enemy (for opportunityAttack) */
  counterTargetHpLoss?: number;
  /** Hope gained by the reacting character */
  hopeGain: number;
  /** Hope cost paid */
  hopeCost: number;
  /** Whether the character has used their reaction this round */
  reactionUsed: boolean;
  /** Condition applied to source (if any) */
  conditionApplied?: string;
  /** Source trait/feature that provided this reaction */
  sourceId?: string;
  /** Narrative hint for AI */
  narrationHint: string;
}

// ===== Reaction Availability =====

/**
 * Determine which reactions a character can take in response to a trigger.
 * Each character gets at most one reaction per round.
 */
export function findAvailableReactions(
  character: Character,
  ctx: ReactionContext,
  reactionsUsedThisRound: number,
): ReactionOption[] {
  if (reactionsUsedThisRound >= 1) return []; // Only one reaction per round

  const options: ReactionOption[] = [];

  switch (ctx.trigger) {
    case 'onAttacked':
    case 'onDamageTaken': {
      // Shield Block — anyone with armor can do this
      if (character.armorSlots > 0) {
        options.push({
          type: 'shieldBlock',
          name: '护盾格挡',
          description: `消耗1护甲槽，将伤害严重度降低一级`,
          usesReaction: true,
        });
      }

      // Check trait reactions for onAttacked / onDamageTaken
      const traitReactions = findTraitReactions(character, ctx.trigger);
      options.push(...traitReactions);
      break;
    }

    case 'onEnemyMove': {
      // Opportunity Attack — if the character has a melee weapon
      // (In Daggerheart, opportunity attacks use your main weapon)
      options.push({
        type: 'opportunityAttack',
        name: '借机攻击',
        description: '对离开威胁范围的敌人进行一次攻击',
        attribute: character.mainWeapon.distance === 'melee' ? 'agility' : 'finesse',
        difficulty: 10, // Base difficulty for opportunity attacks
        usesReaction: true,
      });

      const traitReactions = findTraitReactions(character, ctx.trigger);
      options.push(...traitReactions);
      break;
    }

    case 'onAllyDamaged': {
      const traitReactions = findTraitReactions(character, ctx.trigger);
      options.push(...traitReactions);
      break;
    }

    case 'onEnemyCast': {
      const traitReactions = findTraitReactions(character, ctx.trigger);
      options.push(...traitReactions);
      break;
    }
  }

  return options;
}

/**
 * Check character's traits (ancestry, community, class) for reaction-type
 * mechanical effects that match the trigger.
 */
function findTraitReactions(
  character: Character,
  trigger: ReactionTrigger,
): ReactionOption[] {
  const options: ReactionOption[] = [];

  // The character's Daggerheart-specific data has trait effects
  // We check if any of them have a trigger matching this reaction trigger
  const charData = (character as Character & { daggerheartData?: { reactionsUsed: number } }).daggerheartData;

  // For now, check the shared trait effect triggers
  // These are stored in the ancestry/community/class data, applied at character creation
  // The key trait-trigger mappings for reactions:
  const triggerMap: Record<ReactionTrigger, string[]> = {
    onAttacked: ['onEnemyAttack'],
    onDamageTaken: ['onDamaged'],
    onEnemyMove: ['onMove'],
    onAllyDamaged: [],
    onEnemyCast: [],
  };

  const matchingTraitTriggers = triggerMap[trigger] ?? [];

  // Check class hopeFeature / classFeature for reaction triggers
  // These are available on the character as part of their class data
  // Since we can't easily access the raw JSON here, we use the character's
  // known features. In a full implementation, the StateManager would
  // provide the loaded class/ancestry/community data.

  // Example: If the character is a Ranger with Wilderness Survival,
  // they might have onEnemyMove → advantage reaction
  // For now, we rely on the TraitEffect system at the rules-engine level

  return options;
}

// ===== Reaction Resolution =====

/**
 * Resolve a declared reaction against the trigger context.
 * Returns mechanical results; the caller applies state changes.
 */
export function resolveReaction(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  switch (declaration.type) {
    case 'shieldBlock':
      return resolveShieldBlock(character, declaration, ctx);
    case 'opportunityAttack':
      return resolveOpportunityAttack(character, declaration, ctx);
    case 'uncannyDodge':
      return resolveUncannyDodge(character, declaration, ctx);
    case 'traitReaction':
      return resolveTraitReaction(character, declaration, ctx);
    case 'domainCardReaction':
      return resolveDomainCardReaction(character, declaration, ctx);
    default:
      return {
        type: declaration.type,
        success: false,
        isCritical: false,
        damagePrevented: 0,
        armorSlotsSpent: 0,
        hopeGain: 0,
        hopeCost: 0,
        reactionUsed: false,
        narrationHint: '未知反应类型',
      };
  }
}

/**
 * Shield Block: spend 1 armor slot to reduce damage severity by one tier.
 * In Daggerheart, this is the standard armor usage reaction.
 */
function resolveShieldBlock(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  const slotsToSpend = Math.min(declaration.armorSlotsToSpend ?? 1, character.armorSlots);

  if (slotsToSpend <= 0 || ctx.rawDamage == null) {
    return {
      type: 'shieldBlock',
      success: false,
      isCritical: false,
      damagePrevented: 0,
      armorSlotsSpent: 0,
      hopeGain: 0,
      hopeCost: 0,
      reactionUsed: false,
      narrationHint: `${character.name}无法使用护盾格挡（没有可用护甲槽）`,
    };
  }

  const severityBefore = ctx.severity ?? calculateDamageSeverity(
    ctx.rawDamage, character.minorThreshold, character.majorThreshold, character.severeThreshold,
  );

  const { newSeverity, slotsSpent } = applyArmorSlot(severityBefore, slotsToSpend);
  const hpBefore = getHpLossFromSeverity(severityBefore);
  const hpAfter = getHpLossFromSeverity(newSeverity);
  const damagePrevented = hpBefore - hpAfter;

  return {
    type: 'shieldBlock',
    success: true,
    isCritical: false,
    damagePrevented,
    newSeverity,
    armorSlotsSpent: slotsSpent,
    hopeGain: 0,
    hopeCost: 0,
    reactionUsed: true,
    narrationHint: `${character.name}使用护盾格挡，消耗${slotsSpent}护甲槽，将伤害从${zhSeverity(severityBefore)}降至${zhSeverity(newSeverity)}，减少${damagePrevented}点生命损失。`,
  };
}

/**
 * Opportunity Attack: when an enemy moves away, make a reaction roll
 * to attack them. On success, deal weapon damage.
 */
function resolveOpportunityAttack(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  const attribute: Attribute = character.mainWeapon.distance === 'melee' ? 'agility' : 'finesse';
  const modifier = character.attributes[attribute] ?? 0;
  const difficulty = ctx.severity ? 12 : 10; // Higher difficulty if under pressure

  const hopeDie = declaration.hopeDie ?? Math.floor(Math.random() * 12) + 1;
  const fearDie = declaration.fearDie ?? Math.floor(Math.random() * 12) + 1;

  const roll = resolveReactionRoll(hopeDie, fearDie, modifier, difficulty);

  if (!roll.success) {
    return {
      type: 'opportunityAttack',
      success: false,
      isCritical: roll.isCritical,
      damagePrevented: 0,
      armorSlotsSpent: 0,
      hopeGain: 0,
      hopeCost: 0,
      reactionUsed: true,
      narrationHint: `${character.name}的借机攻击失败（${roll.total} vs ${difficulty}）。`,
    };
  }

  // On hit: deal weapon damage to the enemy
  const dieSides = parseInt(character.mainWeapon.damageDie.replace('d', ''), 10);
  const weaponDamage = Math.floor(Math.random() * dieSides) + 1 + Math.max(0, modifier);

  return {
    type: 'opportunityAttack',
    success: true,
    isCritical: roll.isCritical,
    damagePrevented: 0,
    armorSlotsSpent: 0,
    counterDamage: weaponDamage,
    counterTargetHpLoss: weaponDamage,
    hopeGain: 0,
    hopeCost: 0,
    reactionUsed: true,
    narrationHint: `${character.name}借机攻击命中！对移动的敌人造成${weaponDamage}点伤害。`,
  };
}

/**
 * Uncanny Dodge: reaction roll to reduce or negate an attack.
 * Used by traits like Elven Quick Reflexes.
 */
function resolveUncannyDodge(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  const attribute: Attribute = 'agility';
  const modifier = character.attributes[attribute] ?? 0;
  const difficulty = ctx.rawDamage ?? 15;

  const hopeDie = declaration.hopeDie ?? Math.floor(Math.random() * 12) + 1;
  const fearDie = declaration.fearDie ?? Math.floor(Math.random() * 12) + 1;

  const roll = resolveReactionRoll(hopeDie, fearDie, modifier, difficulty);

  if (!roll.success) {
    return {
      type: 'uncannyDodge',
      success: false,
      isCritical: roll.isCritical,
      damagePrevented: 0,
      armorSlotsSpent: 0,
      hopeGain: 0,
      hopeCost: 0,
      reactionUsed: true,
      narrationHint: `${character.name}试图闪避但失败了。`,
    };
  }

  // Success: reduce severity by one tier (like a free armor slot)
  const severityBefore = ctx.severity ?? calculateDamageSeverity(
    ctx.rawDamage ?? 0, character.minorThreshold, character.majorThreshold, character.severeThreshold,
  );
  const { newSeverity } = applyArmorSlot(severityBefore, 1);
  const hpBefore = getHpLossFromSeverity(severityBefore);
  const hpAfter = getHpLossFromSeverity(newSeverity);
  const damagePrevented = hpBefore - hpAfter;

  return {
    type: 'uncannyDodge',
    success: true,
    isCritical: roll.isCritical,
    damagePrevented,
    newSeverity,
    armorSlotsSpent: 0,
    hopeGain: 0,
    hopeCost: 0,
    reactionUsed: true,
    narrationHint: `${character.name}成功闪避！将伤害从${zhSeverity(severityBefore)}降至${zhSeverity(newSeverity)}，减少${damagePrevented}点生命损失。`,
  };
}

/**
 * Trait reaction: resolve a trait-provided reaction.
 * The specific effect is determined by the trait's mechanicalEffects.
 */
function resolveTraitReaction(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  // Trait reactions are resolved by the trait effect system
  // This is a placeholder that the SocketServer will wire up
  // by calling resolveTraitEffects with the appropriate trigger
  return {
    type: 'traitReaction',
    success: true,
    isCritical: false,
    damagePrevented: 0,
    armorSlotsSpent: 0,
    hopeGain: 0,
    hopeCost: 0,
    reactionUsed: true,
    sourceId: declaration.sourceId,
    narrationHint: `${character.name}使用了特性反应。`,
  };
}

/**
 * Domain card reaction: resolve a domain card used as a reaction.
 * The specific effect is determined by the card's effects array.
 */
function resolveDomainCardReaction(
  character: Character,
  declaration: ReactionDeclaration,
  ctx: ReactionContext,
): ReactionResolution {
  // Domain card reactions are resolved by the card effect system
  return {
    type: 'domainCardReaction',
    success: true,
    isCritical: false,
    damagePrevented: 0,
    armorSlotsSpent: 0,
    hopeGain: 0,
    hopeCost: 1, // Domain cards typically cost 1 hope
    reactionUsed: true,
    sourceId: declaration.sourceId,
    narrationHint: `${character.name}使用了领域卡反应。`,
  };
}

// ===== Helpers =====

function zhSeverity(s: DamageSeverity): string {
  return { none: '无', minor: '轻度', major: '重度', severe: '严重' }[s];
}
