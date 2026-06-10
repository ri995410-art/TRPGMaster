import {
  getTier,
  calculateThresholds,
  getDamageSeverity,
  getHpChangeFromSeverity,
  DIFFICULTY_LEVELS,
  ROLL_RESULT_LABELS,
  DAMAGE_SEVERITY_LABELS,
  ATTRIBUTE_LABELS,
  CONDITION_LABELS,
  DOMAIN_LABELS,
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
      // Official: major = armorBase + level, severe = armorBaseSevere + level
      const result = calculateThresholds(6, 13, 1); // e.g.皮甲: 6/13, level 1
      expect(result.major).toBe(7);   // 6 + 1
      expect(result.severe).toBe(14); // 13 + 1
      expect(result.massive).toBe(28); // 14 * 2
    });

    it('includes modifiers', () => {
      const result = calculateThresholds(6, 13, 1, 2);
      expect(result.major).toBe(9);   // 6 + 1 + 2
      expect(result.severe).toBe(16); // 13 + 1 + 2
    });

    it('handles heavy armor', () => {
      // 锁子甲: 7/15, level 1
      const result = calculateThresholds(7, 15, 1);
      expect(result.major).toBe(8);   // 7 + 1
      expect(result.severe).toBe(16); // 15 + 1
    });
  });

  describe('getDamageSeverity', () => {
    const majorThreshold = 8;
    const severeThreshold = 16;

    it('returns minor for damage below major threshold', () => {
      expect(getDamageSeverity(5, majorThreshold, severeThreshold)).toBe('minor');
      expect(getDamageSeverity(7, majorThreshold, severeThreshold)).toBe('minor');
    });

    it('returns major for damage at/above major but below severe', () => {
      expect(getDamageSeverity(8, majorThreshold, severeThreshold)).toBe('major');
      expect(getDamageSeverity(15, majorThreshold, severeThreshold)).toBe('major');
    });

    it('returns severe for damage at/above severe threshold', () => {
      expect(getDamageSeverity(16, majorThreshold, severeThreshold)).toBe('severe');
      expect(getDamageSeverity(31, majorThreshold, severeThreshold)).toBe('severe');
    });

    it('returns massive for damage >= severe threshold * 2', () => {
      expect(getDamageSeverity(32, majorThreshold, severeThreshold)).toBe('massive');
    });

    it('handles edge case: damage exactly at severe*2 - 1', () => {
      expect(getDamageSeverity(31, majorThreshold, severeThreshold)).toBe('severe');
    });
  });

  describe('getHpChangeFromSeverity', () => {
    it('returns correct HP change for each severity', () => {
      expect(getHpChangeFromSeverity('minor')).toBe(1);
      expect(getHpChangeFromSeverity('major')).toBe(2);
      expect(getHpChangeFromSeverity('severe')).toBe(3);
      expect(getHpChangeFromSeverity('critical')).toBe(3); // deprecated alias
      expect(getHpChangeFromSeverity('massive')).toBe(4);
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

    it('DAMAGE_SEVERITY_LABELS has all severity types', () => {
      expect(DAMAGE_SEVERITY_LABELS.minor).toBe('轻度');
      expect(DAMAGE_SEVERITY_LABELS.major).toBe('重度');
      expect(DAMAGE_SEVERITY_LABELS.severe).toBe('严重');
      expect(DAMAGE_SEVERITY_LABELS.critical).toBe('严重'); // deprecated alias
      expect(DAMAGE_SEVERITY_LABELS.massive).toBe('巨额');
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

    it('DOMAIN_LABELS has 11 domains', () => {
      expect(Object.keys(DOMAIN_LABELS)).toHaveLength(11);
      expect(DOMAIN_LABELS.arcane).toBe('奥术');
      expect(DOMAIN_LABELS.valor).toBe('勇气');
      expect(DOMAIN_LABELS.song).toBe('歌谣');
      expect(DOMAIN_LABELS.nature).toBe('自然');
    });
  });
});