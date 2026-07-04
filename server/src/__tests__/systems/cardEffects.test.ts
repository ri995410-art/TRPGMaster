import { resolveCardEffect, getCardTotalHopeCost, cardRequiresRoll } from '../../rules/systems/cardEffects';
import type { CardEffect } from '@trpgmaster/shared';
import type { Character, CombatEnemy } from '@trpgmaster/shared';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1', name: 'TestChar', classId: 'warrior', subclassId: '',
    ancestryId: 'human', communityId: 'village',
    level: 1, tier: 1, proficiency: 1,
    attributes: { agility: 1, strength: 2, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
    attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hp: 10, maxHp: 10, stress: 0, maxStress: 3, hope: 2, maxHope: 6,
    armorSlots: 2, maxArmorSlots: 3, evasion: 10,
    minorThreshold: 6, majorThreshold: 12, severeThreshold: 24,
    mainWeapon: { id: 'longsword', name: 'Longsword', nameEn: 'Longsword', attribute: 'agility', distance: 'melee', damageDie: 'd8', damageModifier: 0, load: 'oneHanded', traits: [], weaponTier: 1 },
    armor: { id: 'leather', name: 'Leather', nameEn: 'Leather', baseThreshold: 6, baseThresholdSevere: 13, armorSlots: 3, evasionPenalty: 0, traits: [], armorTier: 1 },
    inventory: [], gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
    experiences: [], domainCardConfig: { loadout: [], vault: [], maxLoadout: 5 },
    featureUses: {}, scars: [], conditions: [], resistances: [], reactionsUsed: 0,
    backstory: '', personalQuest: '', relationships: [], adventureSummaries: [],
    ...overrides,
  } as Character;
}

function makeEnemy(overrides: Partial<CombatEnemy> = {}): CombatEnemy {
  return {
    id: 'enemy-1', statBlockId: 'goblin', name: 'Goblin',
    currentHp: 10, maxHp: 10, currentStress: 0, maxStress: 3,
    conditions: [], isFocused: false, hasActed: false,
    evasion: 10, behavior: 'bruiser', attacks: [], features: [],
    ...overrides,
  };
}

describe('cardEffects', () => {
  describe('resolveCardEffect — heal', () => {
    it('heals target with formula', () => {
      const source = makeCharacter();
      const target = makeCharacter({ id: 'char-2', hp: 5 });
      const effect: CardEffect = {
        type: 'heal',
        target: 'self',
        formula: { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'direct' },
        description: 'Heal 1d8 HP',
      };
      const result = resolveCardEffect(effect, source, target);
      expect(result.hpChange).toBeGreaterThanOrEqual(1);
      expect(result.hpChange).toBeLessThanOrEqual(8);
      expect(result.hpChange).toBeGreaterThan(0);
    });

    it('heal does not exceed maxHp — caller responsibility', () => {
      // The card effect system returns raw hpChange; capping is the caller's job
      const source = makeCharacter();
      const target = makeCharacter({ id: 'char-2', hp: 9, maxHp: 10 });
      const effect: CardEffect = {
        type: 'heal',
        target: 'self',
        formula: { dice: [{ count: 2, sides: 8 }], modifier: 0, type: 'direct' },
        description: 'Heal 2d8 HP',
      };
      const result = resolveCardEffect(effect, source, target);
      // Result may exceed maxHp — caller must clamp
      expect(result.hpChange).toBeGreaterThanOrEqual(2);
    });

    it('heal with stress relief', () => {
      const source = makeCharacter();
      const target = makeCharacter({ id: 'char-2' });
      const effect: CardEffect = {
        type: 'heal',
        target: 'self',
        stressRelief: 1,
        description: 'Clear 1 stress',
      };
      const result = resolveCardEffect(effect, source, target);
      expect(result.stressChange).toBe(-1);
    });
  });

  describe('resolveCardEffect — damage', () => {
    it('deals damage to target with formula', () => {
      const source = makeCharacter();
      const target = makeEnemy({ id: 'enemy-1' });
      const effect: CardEffect = {
        type: 'damage',
        target: 'enemy',
        formula: { dice: [{ count: 2, sides: 6 }], modifier: 3, type: 'physical' },
        description: 'Deal 2d6+3 damage',
      };
      const result = resolveCardEffect(effect, source, target);
      expect(result.hpChange).toBeLessThanOrEqual(-(2 + 3)); // At least 2+3
      expect(result.hpChange).toBeGreaterThanOrEqual(-(2 * 6 + 3)); // At most 2*6+3
    });

    it('damage with stress damage', () => {
      const source = makeCharacter();
      const target = makeEnemy();
      const effect: CardEffect = {
        type: 'damage',
        target: 'enemy',
        formula: { dice: [{ count: 1, sides: 6 }], modifier: 0, type: 'magical' },
        stressDamage: 1,
        description: 'Deal 1d6 magic damage + 1 stress',
      };
      const result = resolveCardEffect(effect, source, target);
      expect(result.stressChange).toBe(1);
      expect(result.hpChange).toBeLessThan(0);
    });
  });

  describe('resolveCardEffect — hopeCost', () => {
    it('tracks hopeCost from effect', () => {
      const source = makeCharacter();
      const effect: CardEffect = {
        type: 'buff',
        target: 'self',
        hopeCost: 2,
        advantageGranted: 1,
        description: 'Gain advantage (costs 2 hope)',
      };
      const result = resolveCardEffect(effect, source);
      expect(result.hopeCost).toBe(2);
    });
  });

  describe('resolveCardEffect — no target', () => {
    it('works without a target for self-targeted effects', () => {
      const source = makeCharacter();
      const effect: CardEffect = {
        type: 'buff',
        target: 'self',
        advantageGranted: 1,
        description: 'Gain advantage',
      };
      const result = resolveCardEffect(effect, source);
      expect(result.advantageGranted).toBe(1);
      expect(result.targetId).toBeUndefined();
    });
  });

  describe('getCardTotalHopeCost', () => {
    it('sums hope costs across multiple effects', () => {
      const effects: CardEffect[] = [
        { type: 'heal', target: 'self', hopeCost: 1, description: 'Heal' },
        { type: 'buff', target: 'self', hopeCost: 2, description: 'Buff' },
        { type: 'damage', target: 'enemy', description: 'Damage' },
      ];
      expect(getCardTotalHopeCost(effects)).toBe(3);
    });

    it('returns 0 for effects with no hopeCost', () => {
      const effects: CardEffect[] = [
        { type: 'damage', target: 'enemy', description: 'Damage' },
      ];
      expect(getCardTotalHopeCost(effects)).toBe(0);
    });
  });

  describe('cardRequiresRoll', () => {
    it('returns true for damage with dice', () => {
      const effects: CardEffect[] = [
        { type: 'damage', target: 'enemy', formula: { dice: [{ count: 1, sides: 6 }], modifier: 0, type: 'physical' }, description: 'Damage' },
      ];
      expect(cardRequiresRoll(effects)).toBe(true);
    });

    it('returns true for heal with dice', () => {
      const effects: CardEffect[] = [
        { type: 'heal', target: 'self', formula: { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'direct' }, description: 'Heal' },
      ];
      expect(cardRequiresRoll(effects)).toBe(true);
    });

    it('returns false for buff effects', () => {
      const effects: CardEffect[] = [
        { type: 'buff', target: 'self', advantageGranted: 1, description: 'Buff' },
      ];
      expect(cardRequiresRoll(effects)).toBe(false);
    });
  });
});
