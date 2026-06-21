import {
  getTier,
  calculateThresholds,
  getDamageSeverity,
  getHpLossFromSeverity,
  DIFFICULTY_LEVELS,
  ROLL_RESULT_LABELS,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_SEVERITY_HP,
  ATTRIBUTE_LABELS,
  CONDITION_LABELS,
  DOMAIN_LABELS,
  TIER_LEVELS,
  DISTANCE_SQUARES,
} from '../index';

describe('Shared Types - Helper Functions', () => {
  describe('getTier', () => {
    it('returns tier 1 for level 1', () => {
      expect(getTier(1)).toBe(1);
    });

    it('returns tier 2 for levels 2-4', () => {
      expect(getTier(2)).toBe(2);
      expect(getTier(3)).toBe(2);
      expect(getTier(4)).toBe(2);
    });

    it('returns tier 3 for levels 5-7', () => {
      expect(getTier(5)).toBe(3);
      expect(getTier(6)).toBe(3);
      expect(getTier(7)).toBe(3);
    });

    it('returns tier 4 for levels 8-10', () => {
      expect(getTier(8)).toBe(4);
      expect(getTier(9)).toBe(4);
      expect(getTier(10)).toBe(4);
    });
  });

  describe('calculateThresholds', () => {
    it('calculates thresholds with armor base + level', () => {
      // New system: minor = armorBaseMinor + level, major = armorBaseMajor + level, severe = major * 2
      const result = calculateThresholds(5, 11, 1); // e.g. 皮甲: 5/11, level 1
      expect(result.minor).toBe(6);  // 5 + 1
      expect(result.major).toBe(12); // 11 + 1
      expect(result.severe).toBe(24); // 12 * 2
    });

    it('includes modifiers', () => {
      const result = calculateThresholds(5, 11, 1, 2);
      expect(result.minor).toBe(8);  // 5 + 1 + 2
      expect(result.major).toBe(14); // 11 + 1 + 2
    });

    it('handles heavy armor', () => {
      // 锁子甲: 7/15, level 1
      const result = calculateThresholds(7, 15, 1);
      expect(result.minor).toBe(8);  // 7 + 1
      expect(result.major).toBe(16); // 15 + 1
    });
  });

  describe('getDamageSeverity', () => {
    const minorThreshold = 6;
    const majorThreshold = 12;
    const severeThreshold = 24;

    it('returns none for zero damage', () => {
      expect(getDamageSeverity(0, majorThreshold, severeThreshold)).toBe('none');
    });

    it('returns minor for damage below major threshold', () => {
      expect(getDamageSeverity(5, majorThreshold, severeThreshold)).toBe('minor');
      expect(getDamageSeverity(11, majorThreshold, severeThreshold)).toBe('minor');
    });

    it('returns major for damage at/above major but below severe', () => {
      expect(getDamageSeverity(12, majorThreshold, severeThreshold)).toBe('major');
      expect(getDamageSeverity(23, majorThreshold, severeThreshold)).toBe('major');
    });

    it('returns severe for damage at/above severe threshold', () => {
      expect(getDamageSeverity(24, majorThreshold, severeThreshold)).toBe('severe');
      expect(getDamageSeverity(50, majorThreshold, severeThreshold)).toBe('severe');
    });
  });

  describe('getHpLossFromSeverity', () => {
    it('returns correct HP loss for each severity', () => {
      expect(getHpLossFromSeverity('none')).toBe(0);
      expect(getHpLossFromSeverity('minor')).toBe(1);
      expect(getHpLossFromSeverity('major')).toBe(2);
      expect(getHpLossFromSeverity('severe')).toBe(3);
    });
  });

  describe('Constants', () => {
    it('DIFFICULTY_LEVELS has 6 entries', () => {
      expect(DIFFICULTY_LEVELS).toHaveLength(6);
    });

    it('difficulty values match expected range', () => {
      expect(DIFFICULTY_LEVELS[0].value).toBe(5);
      expect(DIFFICULTY_LEVELS[5].value).toBe(30);
    });

    it('ROLL_RESULT_LABELS has all 5 result types', () => {
      expect(ROLL_RESULT_LABELS.criticalSuccess).toBe('关键成功');
      expect(ROLL_RESULT_LABELS.hopeSuccess).toBe('希望成功');
      expect(ROLL_RESULT_LABELS.fearSuccess).toBe('恐惧成功');
      expect(ROLL_RESULT_LABELS.hopeFailure).toBe('希望失败');
      expect(ROLL_RESULT_LABELS.fearFailure).toBe('恐惧失败');
    });

    it('DAMAGE_SEVERITY_LABELS has all 4 severity types', () => {
      expect(DAMAGE_SEVERITY_LABELS.none).toBe('无伤');
      expect(DAMAGE_SEVERITY_LABELS.minor).toBe('轻度');
      expect(DAMAGE_SEVERITY_LABELS.major).toBe('重度');
      expect(DAMAGE_SEVERITY_LABELS.severe).toBe('严重');
    });

    it('DAMAGE_SEVERITY_HP maps correctly', () => {
      expect(DAMAGE_SEVERITY_HP.none).toBe(0);
      expect(DAMAGE_SEVERITY_HP.minor).toBe(1);
      expect(DAMAGE_SEVERITY_HP.major).toBe(2);
      expect(DAMAGE_SEVERITY_HP.severe).toBe(3);
    });

    it('ATTRIBUTE_LABELS has 6 attributes with Chinese labels', () => {
      expect(ATTRIBUTE_LABELS.agility).toBe('敏捷');
      expect(ATTRIBUTE_LABELS.strength).toBe('力量');
      expect(ATTRIBUTE_LABELS.finesse).toBe('灵巧');
      expect(ATTRIBUTE_LABELS.instinct).toBe('本能');
      expect(ATTRIBUTE_LABELS.presence).toBe('风度');
      expect(ATTRIBUTE_LABELS.knowledge).toBe('知识');
      expect(Object.keys(ATTRIBUTE_LABELS)).toHaveLength(6);
    });

    it('DOMAIN_LABELS has 9 domains', () => {
      expect(Object.keys(DOMAIN_LABELS)).toHaveLength(9);
      expect(DOMAIN_LABELS.arcane).toBe('奥术');
      expect(DOMAIN_LABELS.valor).toBe('勇气');
      expect(DOMAIN_LABELS.blade).toBe('利刃');
      expect(DOMAIN_LABELS.bone).toBe('骸骨');
    });

    it('TIER_LEVELS has 4 tiers with correct level ranges', () => {
      expect(TIER_LEVELS[1]).toEqual([1, 1]);
      expect(TIER_LEVELS[2]).toEqual([2, 4]);
      expect(TIER_LEVELS[3]).toEqual([5, 7]);
      expect(TIER_LEVELS[4]).toEqual([8, 10]);
    });

    it('DISTANCE_SQUARES has expected values', () => {
      expect(DISTANCE_SQUARES.melee).toBe(1);
      expect(DISTANCE_SQUARES.nearby).toBe(3);
      expect(DISTANCE_SQUARES.far).toBe(12);
    });

    it('CONDITION_LABELS has 3 base conditions', () => {
      expect(CONDITION_LABELS.hidden).toBe('隐藏');
      expect(CONDITION_LABELS.restrained).toBe('束缚');
      expect(CONDITION_LABELS.vulnerable).toBe('脆弱');
    });
  });
});
