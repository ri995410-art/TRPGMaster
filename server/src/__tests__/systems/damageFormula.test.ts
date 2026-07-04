import {
  rollDamageFormula,
  maxDamageFormula,
  averageDamageFormula,
  rollDamageDice,
  createDamageFormula,
} from '../../rules/systems/damageFormula';
import { applyResistance } from '../../rules/systems/DaggerHeartRules';
import type { DamageFormula, Resistance } from '@trpgmaster/shared';

describe('damageFormula', () => {
  describe('rollDamageFormula', () => {
    it('single die roll produces valid result', () => {
      const formula: DamageFormula = { dice: [{ count: 1, sides: 6 }], modifier: 0, type: 'physical' };
      const result = rollDamageFormula(formula);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(6);
      expect(result.diceResults).toHaveLength(1);
      expect(result.diceResults[0].rolls).toHaveLength(1);
      expect(result.type).toBe('physical');
    });

    it('multiple dice roll produces valid result', () => {
      const formula: DamageFormula = { dice: [{ count: 3, sides: 8 }], modifier: 2, type: 'magical' };
      const result = rollDamageFormula(formula);
      expect(result.total).toBeGreaterThanOrEqual(3 + 2); // 3 * 1 + 2
      expect(result.total).toBeLessThanOrEqual(3 * 8 + 2); // 3 * 8 + 2
      expect(result.diceResults[0].rolls).toHaveLength(3);
      expect(result.modifier).toBe(2);
    });

    it('multi-component dice formula', () => {
      const formula: DamageFormula = {
        dice: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }],
        modifier: 3,
        type: 'direct',
      };
      const result = rollDamageFormula(formula);
      expect(result.diceResults).toHaveLength(2);
      expect(result.diceResults[0].rolls).toHaveLength(2);
      expect(result.diceResults[1].rolls).toHaveLength(1);
      const minTotal = 2 * 1 + 1 + 3;
      const maxTotal = 2 * 6 + 8 + 3;
      expect(result.total).toBeGreaterThanOrEqual(minTotal);
      expect(result.total).toBeLessThanOrEqual(maxTotal);
    });
  });

  describe('maxDamageFormula', () => {
    it('returns max of all dice + modifier', () => {
      const formula: DamageFormula = { dice: [{ count: 2, sides: 8 }], modifier: 3, type: 'physical' };
      expect(maxDamageFormula(formula)).toBe(2 * 8 + 3);
    });

    it('works with no modifier', () => {
      const formula: DamageFormula = { dice: [{ count: 1, sides: 12 }], modifier: 0, type: 'magical' };
      expect(maxDamageFormula(formula)).toBe(12);
    });

    it('works with multiple dice components', () => {
      const formula: DamageFormula = { dice: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 5, type: 'physical' };
      expect(maxDamageFormula(formula)).toBe(2 * 6 + 8 + 5);
    });
  });

  describe('averageDamageFormula', () => {
    it('returns expected average (floor)', () => {
      const formula: DamageFormula = { dice: [{ count: 2, sides: 6 }], modifier: 3, type: 'physical' };
      // Average of d6 = 3.5, so 2d6 = 7, +3 = 10
      expect(averageDamageFormula(formula)).toBe(10);
    });

    it('floors the result', () => {
      const formula: DamageFormula = { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'magical' };
      // Average of d8 = 4.5, floor = 4
      expect(averageDamageFormula(formula)).toBe(4);
    });
  });

  describe('resistance and immunity', () => {
    it('resistance halves damage (rounded down)', () => {
      const resistances: Resistance[] = [{ damageType: 'physical', mode: 'resistance' }];
      const result = applyResistance(10, 'physical', resistances);
      expect(result.finalDamage).toBe(5);
      expect(result.resisted).toBe(true);
      expect(result.immune).toBe(false);
    });

    it('immunity reduces damage to 0', () => {
      const resistances: Resistance[] = [{ damageType: 'magical', mode: 'immunity' }];
      const result = applyResistance(20, 'magical', resistances);
      expect(result.finalDamage).toBe(0);
      expect(result.resisted).toBe(false);
      expect(result.immune).toBe(true);
    });

    it('no matching resistance returns full damage', () => {
      const resistances: Resistance[] = [{ damageType: 'physical', mode: 'resistance' }];
      const result = applyResistance(10, 'magical', resistances);
      expect(result.finalDamage).toBe(10);
      expect(result.resisted).toBe(false);
      expect(result.immune).toBe(false);
    });

    it('empty resistances returns full damage', () => {
      const result = applyResistance(15, 'physical', []);
      expect(result.finalDamage).toBe(15);
    });

    it('odd damage halved rounds down', () => {
      const resistances: Resistance[] = [{ damageType: 'physical', mode: 'resistance' }];
      const result = applyResistance(7, 'physical', resistances);
      expect(result.finalDamage).toBe(3);
    });
  });
});
