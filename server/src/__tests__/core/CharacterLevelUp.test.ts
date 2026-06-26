/**
 * CharacterLevelUp - 单测（任务 4.1）
 * 验证：升级选项、槽位费用、属性/经历/领域卡应用、tier advancement
 */
import { CharacterLevelUp } from '../../core/CharacterLevelUp';
import type { LevelUpRequest } from '../../core/CharacterLevelUp';
import type { Character, Attribute, DomainCard, DomainType } from '@trpgmaster/shared';

function makeCard(overrides: { id: string; name: string; domain: string; level: number }): DomainCard {
  return {
    id: overrides.id, name: overrides.name, nameEn: overrides.name,
    domain: overrides.domain as DomainType, level: overrides.level,
    type: 'ability', recallCost: 0, description: '', effect: '', hopeCost: 0,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'TestChar',
    classId: 'bard',
    subclassId: '',
    ancestryId: 'clockwork',
    communityId: 'high-city',
    level: 1,
    tier: 1,
    proficiency: 1,
    attributes: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
    attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hp: 5, maxHp: 5,
    stress: 0, maxStress: 6,
    hope: 2, maxHope: 6,
    armorSlots: 3, maxArmorSlots: 3,
    evasion: 10,
    minorThreshold: 6, majorThreshold: 12, severeThreshold: 24,
    mainWeapon: { id: 'broadsword', name: '阔剑', nameEn: 'Broadsword', damage: '1d10', range: 'melee', traits: [] } as any,
    armor: { id: 'padded-armor', name: '棉甲', nameEn: 'Padded Armor', armorSlots: 3, evasionPenalty: 0, baseThreshold: 5, baseThresholdSevere: 11 } as any,
    inventory: [],
    gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
    experiences: [
      { id: 'exp_1', name: '吟游诗人', modifier: 2 },
      { id: 'exp_2', name: '旅行者', modifier: 1 },
    ],
    domainCardConfig: {
      loadout: [
        makeCard({ id: 'codex-book-of-aeva', name: '艾娃之书', domain: 'codex', level: 1 }),
        makeCard({ id: 'elegance-silver-tongue', name: '欺瞒熟手', domain: 'elegance', level: 1 }),
      ],
      vault: [],
      maxLoadout: 5,
    },
    featureUses: {},
    adventureSummaries: [],
    scars: [],
    conditions: [],
    resistances: [],
    reactionsUsed: 0,
    backstory: '',
    personalQuest: '',
    relationships: [],
    ...overrides,
  } as Character;
}

describe('CharacterLevelUp', () => {
  describe('getAvailableOptions', () => {
    test('returns 9 options for level 1 character', () => {
      const char = makeCharacter();
      const options = CharacterLevelUp.getAvailableOptions(char);
      expect(options.length).toBe(9);
      expect(options.map(o => o.type)).toEqual([
        'increaseAttributes', 'increaseHp', 'increaseStress',
        'improveExperiences', 'gainDomainCard', 'increaseEvasion',
        'gainSubclassCard', 'increaseProficiency', 'multiclass',
      ]);
    });

    test('multiclass unavailable below level 5', () => {
      const char = makeCharacter();
      const options = CharacterLevelUp.getAvailableOptions(char);
      const multi = options.find(o => o.type === 'multiclass')!;
      expect(multi.available).toBe(false);
      expect(multi.reason).toBeDefined();
    });

    test('multiclass available at level 5', () => {
      const char = makeCharacter({ level: 4, tier: 2 });
      const options = CharacterLevelUp.getAvailableOptions(char);
      const multi = options.find(o => o.type === 'multiclass')!;
      expect(multi.available).toBe(true);
    });

    test('increaseProficiency costs 2 slots', () => {
      const char = makeCharacter();
      const options = CharacterLevelUp.getAvailableOptions(char);
      const prof = options.find(o => o.type === 'increaseProficiency')!;
      expect(prof.slotCost).toBe(2);
    });

    test('increaseAttributes unavailable with <2 unmarked', () => {
      const char = makeCharacter({
        attributeMarks: { agility: true, strength: true, finesse: true, instinct: true, presence: true, knowledge: false },
      });
      const options = CharacterLevelUp.getAvailableOptions(char);
      const attrs = options.find(o => o.type === 'increaseAttributes')!;
      expect(attrs.available).toBe(false);
    });

    test('improveExperiences unavailable with <2 experiences', () => {
      const char = makeCharacter({ experiences: [{ id: 'exp_1', name: '单一', modifier: 2 }] });
      const options = CharacterLevelUp.getAvailableOptions(char);
      const exp = options.find(o => o.type === 'improveExperiences')!;
      expect(exp.available).toBe(false);
    });
  });

  describe('getTierAdvancementBonuses', () => {
    test('level 2 grants extra experience and proficiency', () => {
      const bonuses = CharacterLevelUp.getTierAdvancementBonuses(2);
      expect(bonuses.extraExperience).toEqual({ modifier: 2 });
      expect(bonuses.proficiencyBonus).toBe(1);
      expect(bonuses.clearAttributeMarks).toBe(false);
    });

    test('level 3 no extra bonuses', () => {
      const bonuses = CharacterLevelUp.getTierAdvancementBonuses(3);
      expect(bonuses.extraExperience).toBeUndefined();
      expect(bonuses.proficiencyBonus).toBeUndefined();
      expect(bonuses.clearAttributeMarks).toBe(false);
    });

    test('level 5 grants bonuses and clears marks', () => {
      const bonuses = CharacterLevelUp.getTierAdvancementBonuses(5);
      expect(bonuses.extraExperience).toEqual({ modifier: 2 });
      expect(bonuses.proficiencyBonus).toBe(1);
      expect(bonuses.clearAttributeMarks).toBe(true);
    });

    test('level 8 grants bonuses and clears marks', () => {
      const bonuses = CharacterLevelUp.getTierAdvancementBonuses(8);
      expect(bonuses.extraExperience).toEqual({ modifier: 2 });
      expect(bonuses.proficiencyBonus).toBe(1);
      expect(bonuses.clearAttributeMarks).toBe(true);
    });
  });

  describe('levelUp', () => {
    test('level 1→2 with two 1-cost options succeeds', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      expect(result.character!.level).toBe(2);
      expect(result.character!.maxHp).toBe(6); // 5 + 1
      expect(result.character!.hp).toBe(6);    // also +1 current
      expect(result.character!.maxStress).toBe(7); // 6 + 1
      // Tier advancement at level 2: getTier(1)=1, getTier(2)=2 → tier changed
      expect(result.tierChanged).toBe(true);
      expect(result.oldTier).toBe(1);
      expect(result.newTier).toBe(2);
      // Extra experience at level 2
      expect(result.character!.experiences.length).toBe(3);
      expect(result.character!.proficiency).toBe(2); // 1 + 1 from tier bonus
    });

    test('level 1→3 fails (non-incremental)', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 3,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('逐级');
    });

    test('level > 10 fails', () => {
      const char = makeCharacter({ level: 10, tier: 4 });
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 11,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('10');
    });

    test('slot cost ≠ 2 fails', () => {
      const char = makeCharacter();
      // Only 1 option costing 1 = total 1
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseHp'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('2');
    });

    test('increaseProficiency alone costs 2 slots and succeeds', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseProficiency'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      // proficiency: 1 base + 1 tier bonus (level 2) + 1 increaseProficiency = 3
      expect(result.character!.proficiency).toBe(3);
    });

    test('increaseAttributes with marked attrs fails', () => {
      const char = makeCharacter({
        attributeMarks: { agility: true, strength: true, finesse: false, instinct: false, presence: false, knowledge: false },
      });
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseAttributes', 'increaseHp'],
        attributeChoices: ['agility', 'finesse'], // agility is marked!
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('标记');
    });

    test('increaseAttributes succeeds with unmarked attrs', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseAttributes', 'increaseHp'],
        attributeChoices: ['agility', 'strength'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      expect(result.character!.attributes.agility).toBe(3); // 2 + 1
      expect(result.character!.attributes.strength).toBe(2); // 1 + 1
      expect(result.character!.attributeMarks.agility).toBe(true);
      expect(result.character!.attributeMarks.strength).toBe(true);
    });

    test('improveExperiences with invalid ID fails', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['improveExperiences', 'increaseHp'],
        experienceChoices: ['exp_1', 'nonexistent'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('经历'))).toBe(true);
    });

    test('improveExperiences succeeds', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['improveExperiences', 'increaseHp'],
        experienceChoices: ['exp_1', 'exp_2'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      const exp1 = result.character!.experiences.find(e => e.id === 'exp_1')!;
      const exp2 = result.character!.experiences.find(e => e.id === 'exp_2')!;
      expect(exp1.modifier).toBe(3); // 2 + 1
      expect(exp2.modifier).toBe(2); // 1 + 1
    });

    test('gainDomainCard with wrong domain fails', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['gainDomainCard', 'increaseHp'],
        domainCardChoice: 'arcane-rune-amulet', // arcane not bard domain
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('领域'))).toBe(true);
    });

    test('increaseEvasion adds 1', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseEvasion', 'increaseHp'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      expect(result.character!.evasion).toBe(11); // 10 + 1
    });

    test('no tier change at level 2→3', () => {
      const char = makeCharacter({ level: 2, tier: 2 });
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 3,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      expect(result.tierChanged).toBe(false);
      expect(result.oldTier).toBe(2);
      expect(result.newTier).toBe(2);
    });

    test('level 5 clears attribute marks', () => {
      const char = makeCharacter({
        level: 4, tier: 2,
        attributeMarks: { agility: true, strength: true, finesse: false, instinct: false, presence: false, knowledge: false },
      });
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 5,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      expect(result.character!.attributeMarks.agility).toBe(false);
      expect(result.character!.attributeMarks.strength).toBe(false);
    });

    test('domain card swap replaces existing card', () => {
      const char = makeCharacter({ level: 1, tier: 1 });
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['gainDomainCard', 'increaseHp'],
        domainCardChoice: 'codex-book-of-stael',
        domainCardSwap: { add: 'codex-book-of-stael', remove: 'codex-book-of-aeva' },
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      const loadout = result.character!.domainCardConfig.loadout;
      expect(loadout.find(c => c.id === 'codex-book-of-aeva')).toBeUndefined();
      expect(loadout.find(c => c.id === 'codex-book-of-stael')).toBeDefined();
    });

    test('thresholds update after level-up', () => {
      const char = makeCharacter();
      const request: LevelUpRequest = {
        characterId: char.id,
        newLevel: 2,
        options: ['increaseHp', 'increaseStress'],
      };
      const result = CharacterLevelUp.levelUp(char, request);
      expect(result.success).toBe(true);
      // Level 2: minor = 5+2=7, major = 11+2=13, severe = 13*2=26
      expect(result.character!.minorThreshold).toBe(7);
      expect(result.character!.majorThreshold).toBe(13);
      expect(result.character!.severeThreshold).toBe(26);
    });
  });
});
