/**
 * DaggerHeart规则引擎测试
 * TDD Red阶段：定义规则引擎的完整行为规范
 */
import {
  DaggerHeartRules,
  rollDualD12,
  determineRollResult,
  calculateDamageSeverity,
  calculateHpChange,
  applyArmorSlot,
  calculateThresholds,
  spendHope,
  gainFearOnRest,
  getTierFromLevel,
  validateCharacterSheet,
} from '../src/rules/systems/DaggerHeartRules';
import type {
  RollResultType,
  DamageSeverity,
  Attribute,
  Character,
} from '@trpgmaster/shared';

// ===== 二元骰系统测试 =====

describe('DaggerHeart 二元骰系统', () => {
  describe('determineRollResult - 掷骰结果判定', () => {
    it('关键成功：两骰相同且≥难度', () => {
      const result = determineRollResult(8, 8, 0, 15);
      expect(result.type).toBe('criticalSuccess');
      expect(result.success).toBe(true);
    });

    it('关键成功：两骰相同但<难度，仍为关键成功', () => {
      const result = determineRollResult(3, 3, 0, 15);
      expect(result.type).toBe('criticalSuccess');
      expect(result.success).toBe(true); // 关键成功自动成功
    });

    it('希望成功：希望>恐惧且≥难度', () => {
      const result = determineRollResult(10, 5, 0, 15);
      expect(result.type).toBe('hopeSuccess');
      expect(result.success).toBe(true);
    });

    it('恐惧成功：恐惧>希望且≥难度', () => {
      const result = determineRollResult(5, 10, 0, 15);
      expect(result.type).toBe('fearSuccess');
      expect(result.success).toBe(true);
    });

    it('希望失败：希望>恐惧且<难度', () => {
      const result = determineRollResult(8, 3, 0, 15);
      expect(result.type).toBe('hopeFailure');
      expect(result.success).toBe(false);
    });

    it('恐惧失败：恐惧>希望且<难度', () => {
      const result = determineRollResult(3, 8, 0, 15);
      expect(result.type).toBe('fearFailure');
      expect(result.success).toBe(false);
    });

    it('含调整值的判定：+3调整值使结果达到难度', () => {
      const result = determineRollResult(7, 4, 3, 14);
      // 7+4+3=14 >= 14, hope>fear
      expect(result.type).toBe('hopeSuccess');
      expect(result.success).toBe(true);
    });

    it('含调整值的判定：-2调整值使结果低于难度', () => {
      const result = determineRollResult(8, 3, -2, 15);
      // 8+3-2=9 < 15, hope>fear
      expect(result.type).toBe('hopeFailure');
      expect(result.success).toBe(false);
    });
  });

  describe('rollDualD12 - 掷骰模拟', () => {
    it('返回1-12范围内的希望骰和恐惧骰', () => {
      for (let i = 0; i < 100; i++) {
        const { hopeDie, fearDie } = rollDualD12();
        expect(hopeDie).toBeGreaterThanOrEqual(1);
        expect(hopeDie).toBeLessThanOrEqual(12);
        expect(fearDie).toBeGreaterThanOrEqual(1);
        expect(fearDie).toBeLessThanOrEqual(12);
      }
    });
  });
});

// ===== 伤害系统测试 =====

describe('DaggerHeart 伤害系统', () => {
  describe('calculateDamageSeverity - 伤害等级判定', () => {
    it('轻度伤害：伤害 < 重度阈值', () => {
      expect(calculateDamageSeverity(5, 10, 20)).toBe('minor');
    });

    it('重度伤害：≥重度阈值且<严重阈值', () => {
      expect(calculateDamageSeverity(10, 10, 20)).toBe('major');
      expect(calculateDamageSeverity(15, 10, 20)).toBe('major');
      expect(calculateDamageSeverity(19, 10, 20)).toBe('major');
    });

    it('严重伤害：≥严重阈值', () => {
      expect(calculateDamageSeverity(20, 10, 20)).toBe('severe');
      expect(calculateDamageSeverity(25, 10, 20)).toBe('severe');
    });

    it('巨额伤害：≥严重阈值×2', () => {
      expect(calculateDamageSeverity(40, 10, 20)).toBe('massive');
    });

    it('边界值：重度阈值-1为轻度', () => {
      expect(calculateDamageSeverity(9, 10, 20)).toBe('minor');
    });

    it('边界值：严重阈值-1为重度', () => {
      expect(calculateDamageSeverity(19, 10, 20)).toBe('major');
    });
  });

  describe('calculateHpChange - 生命点变化', () => {
    it('轻度伤害标记1HP', () => {
      expect(calculateHpChange('minor')).toBe(1);
    });
    it('重度伤害标记2HP', () => {
      expect(calculateHpChange('major')).toBe(2);
    });
    it('严重伤害标记3HP', () => {
      expect(calculateHpChange('severe')).toBe(3);
    });
    it('巨额伤害标记4HP', () => {
      expect(calculateHpChange('massive')).toBe(4);
    });
  });

  describe('applyArmorSlot - 护甲槽减免', () => {
    it('使用护甲槽：严重→重度', () => {
      expect(applyArmorSlot('severe')).toBe('major');
    });
    it('使用护甲槽：重度→轻度', () => {
      expect(applyArmorSlot('major')).toBe('minor');
    });
    it('使用护甲槽：轻度→无伤害', () => {
      expect(applyArmorSlot('minor')).toBe('none');
    });
    it('使用护甲槽：巨额→严重', () => {
      expect(applyArmorSlot('massive')).toBe('severe');
    });
  });

  describe('calculateThresholds - 伤害阈值计算', () => {
    it('基础计算：护甲阈值+等级', () => {
      const thresholds = calculateThresholds(6, 13, 1, 0);
      expect(thresholds.major).toBe(7);   // 6 + 1
      expect(thresholds.severe).toBe(14); // 13 + 1
    });

    it('含调整值', () => {
      const thresholds = calculateThresholds(7, 15, 1, 2);
      expect(thresholds.major).toBe(10);  // 7 + 1 + 2
      expect(thresholds.severe).toBe(18); // 15 + 1 + 2
    });
  });
});

// ===== 希望点/恐惧点系统测试 =====

describe('DaggerHeart 希望点/恐惧点', () => {
  describe('spendHope - 消耗希望点', () => {
    it('有足够希望点时可以消耗', () => {
      const result = spendHope({ hope: 3, maxHope: 6 }, 1);
      expect(result?.hope).toBe(2);
    });

    it('希望点不足时返回null', () => {
      const result = spendHope({ hope: 0, maxHope: 6 }, 1);
      expect(result).toBeNull();
    });

    it('希望点不能超过上限', () => {
      const result = spendHope({ hope: 6, maxHope: 6 }, -1); // gain hope
      expect(result).toBeNull(); // already at max
    });

    it('消耗3希望点用于接力掷骰', () => {
      const result = spendHope({ hope: 5, maxHope: 6 }, 3);
      expect(result?.hope).toBe(2);
    });
  });

  describe('gainFearOnRest - 休整时GM获得恐惧点', () => {
    it('短休：GM获得1d4恐惧点', () => {
      const fear = gainFearOnRest('short', 4);
      expect(fear).toBeGreaterThanOrEqual(1);
      expect(fear).toBeLessThanOrEqual(4);
    });

    it('长休：GM获得玩家数+1d4恐惧点', () => {
      const fear = gainFearOnRest('long', 4);
      expect(fear).toBeGreaterThanOrEqual(5); // 4 + 1
      expect(fear).toBeLessThanOrEqual(8); // 4 + 4
    });
  });
});

// ===== 等级/位阶系统测试 =====

describe('DaggerHeart 等级与位阶', () => {
  describe('getTierFromLevel', () => {
    it('1级 = 位阶1', () => expect(getTierFromLevel(1)).toBe(1));
    it('2级 = 位阶2', () => expect(getTierFromLevel(2)).toBe(2));
    it('4级 = 位阶2', () => expect(getTierFromLevel(4)).toBe(2));
    it('5级 = 位阶3', () => expect(getTierFromLevel(5)).toBe(3));
    it('7级 = 位阶3', () => expect(getTierFromLevel(7)).toBe(3));
    it('8级 = 位阶4', () => expect(getTierFromLevel(8)).toBe(4));
    it('10级 = 位阶4', () => expect(getTierFromLevel(10)).toBe(4));
  });
});

// ===== 角色卡验证测试 =====

describe('DaggerHeart 角色卡验证', () => {
  const validCharacter: Partial<Character> = {
    name: '测试角色',
    level: 1,
    proficiency: 1,
    attributes: {
      agility: 2, strength: 1, finesse: 1,
      instinct: 0, presence: 0, knowledge: -1,
    },
    hp: 5, maxHp: 5,
    stress: 0, maxStress: 6,
    hope: 2, maxHope: 6,
    armorSlots: 3, maxArmorSlots: 3,
    experiences: [
      { id: 'exp1', name: '战斗训练', modifier: 2 },
      { id: 'exp2', name: '野外生存', modifier: 2 },
    ],
  };

  describe('validateCharacterSheet', () => {
    it('有效角色卡通过验证', () => {
      const errors = validateCharacterSheet(validCharacter as Character);
      expect(errors).toHaveLength(0);
    });

    it('HP不能超过maxHp', () => {
      const char = { ...validCharacter, hp: 10, maxHp: 5 };
      const errors = validateCharacterSheet(char as Character);
      expect(errors).toContainEqual(expect.stringContaining('HP'));
    });

    it('希望点不能超过6', () => {
      const char = { ...validCharacter, hope: 7, maxHope: 6 };
      const errors = validateCharacterSheet(char as Character);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('属性调整值之和应为+3（+2,+1,+1,0,0,-1）', () => {
      const char = {
        ...validCharacter,
        attributes: {
          agility: 3, strength: 1, finesse: 1,
          instinct: 0, presence: 0, knowledge: -1,
        },
      };
      const errors = validateCharacterSheet(char as Character);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

// ===== 德拉肯海姆特有机制测试 =====

describe('德拉肯海姆特有机制', () => {
  describe('污染系统', () => {
    it('污染等级0-6范围', () => {
      const rules = new DaggerHeartRules();
      expect(rules.validateCorruptionLevel(0)).toBe(true);
      expect(rules.validateCorruptionLevel(3)).toBe(true);
      expect(rules.validateCorruptionLevel(6)).toBe(true);
      expect(rules.validateCorruptionLevel(7)).toBe(false);
      expect(rules.validateCorruptionLevel(-1)).toBe(false);
    });

    it('3级污染触发第一次变异', () => {
      const rules = new DaggerHeartRules();
      expect(rules.shouldDrawMutationCard(3, 2)).toBe(true);
    });

    it('5级污染触发第二次变异', () => {
      const rules = new DaggerHeartRules();
      expect(rules.shouldDrawMutationCard(5, 3)).toBe(true);
    });

    it('6级污染角色异变为NPC', () => {
      const rules = new DaggerHeartRules();
      expect(rules.isCorruptionTerminal(6)).toBe(true);
      expect(rules.isCorruptionTerminal(5)).toBe(false);
    });
  });

  describe('探险倒计时', () => {
    it('外城区探险倒计时=4', () => {
      const rules = new DaggerHeartRules();
      expect(rules.getExplorationTimer('outer')).toBe(4);
    });

    it('内城区探险倒计时=3', () => {
      const rules = new DaggerHeartRules();
      expect(rules.getExplorationTimer('inner')).toBe(3);
    });

    it('浓厚污霭探险倒计时=2', () => {
      const rules = new DaggerHeartRules();
      expect(rules.getExplorationTimer('heavy')).toBe(2);
    });
  });

  describe('派系关系', () => {
    it('关系等级范围1-8', () => {
      const rules = new DaggerHeartRules();
      expect(rules.validateFactionRelation(1)).toBe(true);
      expect(rules.validateFactionRelation(8)).toBe(true);
      expect(rules.validateFactionRelation(0)).toBe(false);
      expect(rules.validateFactionRelation(9)).toBe(false);
    });

    it('关系等级含义', () => {
      const rules = new DaggerHeartRules();
      expect(rules.getFactionRelationLabel(1)).toBe('敌对');
      expect(rules.getFactionRelationLabel(3)).toBe('不信任');
      expect(rules.getFactionRelationLabel(5)).toBe('友好');
      expect(rules.getFactionRelationLabel(7)).toBe('盟友');
    });
  });
});
