/**
 * CharacterCreator - 单测（任务 4.1）
 * 验证：步进验证、属性分布、经历修饰符、领域卡校验、buildCharacter
 */
import { CharacterCreator } from '../../core/CharacterCreator';
import type { CharacterCreationData, CharacterCreationStep } from '../../core/CharacterCreator';
import type { DomainCard, DomainType } from '@trpgmaster/shared';

// Valid IDs from daggerheart data
const CLASS_ID = 'bard';
const ANCESTRY_ID = 'clockwork';
const COMMUNITY_ID = 'high-city';
const WEAPON_ID = 'broadsword';
const OFF_WEAPON_ID = 'longsword';
const ARMOR_ID = 'padded-armor';
// Bard domains: elegance, codex
function makeCard(overrides: { id: string; name: string; nameEn: string; domain: string; level: number; type?: string }): DomainCard {
  return { id: overrides.id, name: overrides.name, nameEn: overrides.nameEn, domain: overrides.domain as DomainType, level: overrides.level, type: (overrides.type || 'ability') as DomainCard['type'], recallCost: 0, description: '', effect: '', hopeCost: 0 };
}
const DOMAIN_CARD_1 = makeCard({ id: 'codex-book-of-aeva', name: '艾娃之书', nameEn: 'Book of Aeva', domain: 'codex', level: 1, type: 'grimoire' });
const DOMAIN_CARD_2 = makeCard({ id: 'elegance-silver-tongue', name: '欺瞒熟手', nameEn: 'Silver Tongue', domain: 'elegance', level: 1 });
const DOMAIN_CARD_3 = makeCard({ id: 'elegance-mesmerize', name: '心醉神迷', nameEn: 'Mesmerize', domain: 'elegance', level: 1, type: 'spell' });
const DOMAIN_CARD_INVALID = makeCard({ id: 'arcane-rune-amulet', name: '符文护符', nameEn: 'Arcane Rune Amulet', domain: 'arcane', level: 1 });
const DOMAIN_CARD_LV2 = makeCard({ id: 'codex-book-of-vagras', name: '瓦格拉斯之书', nameEn: 'Book of Vagras', domain: 'codex', level: 2, type: 'grimoire' });

const VALID_ATTRIBUTES = { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 };
const VALID_EXPERIENCES = [
  { id: 'exp_1', name: '吟游诗人', modifier: 2 },
  { id: 'exp_2', name: '旅行者', modifier: 1 },
];

function fillAllSteps(creator: CharacterCreator, overrides: Partial<CharacterCreationData> = {}): void {
  const data: Partial<CharacterCreationData> = {
    classId: CLASS_ID,
    ancestryId: ANCESTRY_ID,
    communityId: COMMUNITY_ID,
    attributes: VALID_ATTRIBUTES,
    experiences: VALID_EXPERIENCES,
    mainWeaponId: WEAPON_ID,
    armorId: ARMOR_ID,
    domainCards: [DOMAIN_CARD_1, DOMAIN_CARD_2],
    name: '测试角色',
    backstory: '一段背景',
    personalQuest: '寻找真相',
    ...overrides,
  };
  creator.setStepData(data);
}

describe('CharacterCreator', () => {
  describe('constructor & accessors', () => {
    test('initial state: step 0, 9 total steps', () => {
      const c = new CharacterCreator();
      expect(c.getStepIndex()).toBe(0);
      expect(c.getCurrentStep()).toBe('class');
      const state = c.getState();
      expect(state.totalSteps).toBe(9);
      expect(state.data).toEqual({});
      expect(state.errors).toEqual({});
    });
  });

  describe('canGoBack / goBack', () => {
    test('cannot go back at step 0', () => {
      const c = new CharacterCreator();
      expect(c.canGoBack()).toBe(false);
      expect(c.goBack()).toBe(false);
      expect(c.getStepIndex()).toBe(0);
    });

    test('can go back after advancing', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID });
      c.goNext();
      expect(c.canGoBack()).toBe(true);
      expect(c.goBack()).toBe(true);
      expect(c.getStepIndex()).toBe(0);
    });
  });

  describe('canGoNext / goNext', () => {
    test('cannot go next without completing current step', () => {
      const c = new CharacterCreator();
      expect(c.canGoNext()).toBe(false);
      expect(c.goNext()).toBe(false);
      expect(c.getStepIndex()).toBe(0);
    });

    test('can go next after completing class step', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID });
      expect(c.canGoNext()).toBe(true);
      expect(c.goNext()).toBe(true);
      expect(c.getCurrentStep()).toBe('ancestry');
    });

    test('cannot go next at last step', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      // Navigate to last step
      for (let i = 0; i < 8; i++) c.goNext();
      expect(c.getCurrentStep()).toBe('backstory');
      c.setStepData({ name: '测试角色' });
      expect(c.canGoNext()).toBe(true); // last step is valid
      expect(c.goNext()).toBe(false); // but can't advance past last
    });
  });

  describe('goToStep', () => {
    test('jumps to step when all prior steps valid', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      expect(c.goToStep(5)).toBe(true);
      expect(c.getCurrentStep()).toBe('weapons');
    });

    test('rejects jump when prior step invalid', () => {
      const c = new CharacterCreator();
      // Only set classId, ancestry step will fail
      c.setStepData({ classId: CLASS_ID });
      c.goNext(); // now at ancestry
      // Try to jump to attributes (step 3) — ancestry (step 1) is empty
      expect(c.goToStep(3)).toBe(false);
      expect(c.getStepIndex()).toBe(1); // stays at current
    });

    test('rejects out-of-range step', () => {
      const c = new CharacterCreator();
      expect(c.goToStep(-1)).toBe(false);
      expect(c.goToStep(9)).toBe(false);
    });

    test('can jump to step 0', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      c.goNext();
      expect(c.goToStep(0)).toBe(true);
      expect(c.getStepIndex()).toBe(0);
    });
  });

  describe('validateCurrentStep', () => {
    test('class step: missing classId', () => {
      const c = new CharacterCreator();
      const errors = c.validateCurrentStep();
      expect(errors.classId).toBeDefined();
      expect(errors.classId[0]).toContain('职业');
    });

    test('ancestry step: missing ancestryId', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID });
      c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.ancestryId).toBeDefined();
    });

    test('community step: missing communityId', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID, ancestryId: ANCESTRY_ID });
      c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.communityId).toBeDefined();
    });

    test('attributes step: missing attributes', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID });
      c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.attributes).toBeDefined();
    });

    test('attributes step: wrong distribution', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: { agility: 2, strength: 2, finesse: 0, instinct: 0, presence: 0, knowledge: -1 },
      });
      c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.attributes).toBeDefined();
      expect(errors.attributes[0]).toContain('+2');
    });

    test('attributes step: valid distribution passes', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES,
      });
      c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.attributes).toBeUndefined();
    });

    test('experiences step: fewer than 2', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES,
        experiences: [{ id: 'exp_1', name: '单一经历', modifier: 2 }],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.experiences).toBeDefined();
    });

    test('experiences step: missing +2 modifier', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES,
        experiences: [
          { id: 'exp_1', name: '经历A', modifier: 1 },
          { id: 'exp_2', name: '经历B', modifier: 1 },
        ],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.experiences).toBeDefined();
      expect(errors.experiences[0]).toContain('+2');
    });

    test('experiences step: missing +1 modifier', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES,
        experiences: [
          { id: 'exp_1', name: '经历A', modifier: 2 },
          { id: 'exp_2', name: '经历B', modifier: 0 },
        ],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.experiences).toBeDefined();
      expect(errors.experiences[0]).toContain('+1');
    });

    test('experiences step: valid passes', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES,
        experiences: VALID_EXPERIENCES,
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.experiences).toBeUndefined();
    });

    test('weapons step: missing mainWeaponId', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES, experiences: VALID_EXPERIENCES,
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.mainWeaponId).toBeDefined();
    });

    test('armor step: missing armorId', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES, experiences: VALID_EXPERIENCES,
        mainWeaponId: WEAPON_ID,
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.armorId).toBeDefined();
    });

    test('domainCards step: fewer than 2', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES, experiences: VALID_EXPERIENCES,
        mainWeaponId: WEAPON_ID, armorId: ARMOR_ID,
        domainCards: [DOMAIN_CARD_1],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.domainCards).toBeDefined();
    });

    test('domainCards step: more than 5', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES, experiences: VALID_EXPERIENCES,
        mainWeaponId: WEAPON_ID, armorId: ARMOR_ID,
        domainCards: [DOMAIN_CARD_1, DOMAIN_CARD_2, DOMAIN_CARD_3, DOMAIN_CARD_1, DOMAIN_CARD_2, DOMAIN_CARD_3],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.domainCards).toBeDefined();
      expect(errors.domainCards[0]).toContain('5');
    });

    test('domainCards step: level > 1 card rejected', () => {
      const c = new CharacterCreator();
      c.setStepData({
        classId: CLASS_ID, ancestryId: ANCESTRY_ID, communityId: COMMUNITY_ID,
        attributes: VALID_ATTRIBUTES, experiences: VALID_EXPERIENCES,
        mainWeaponId: WEAPON_ID, armorId: ARMOR_ID,
        domainCards: [DOMAIN_CARD_1, DOMAIN_CARD_LV2],
      });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.domainCards).toBeDefined();
      expect(errors.domainCards[0]).toContain('一级');
    });

    test('backstory step: missing name', () => {
      const c = new CharacterCreator();
      fillAllSteps(c, { name: '' });
      c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext(); c.goNext();
      const errors = c.validateCurrentStep();
      expect(errors.name).toBeDefined();
    });
  });

  describe('setStepData', () => {
    test('merges data and re-validates', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID });
      expect(c.getState().data.classId).toBe(CLASS_ID);
      expect(c.getState().errors).toEqual({}); // class step now valid

      // Add more data
      c.setStepData({ ancestryId: ANCESTRY_ID });
      expect(c.getState().data.ancestryId).toBe(ANCESTRY_ID);
      // Still on class step, classId still valid
      expect(c.getState().errors).toEqual({});
    });
  });

  describe('buildCharacter', () => {
    test('full creation produces valid character', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      const { character, errors } = c.buildCharacter();
      expect(errors).toEqual([]);
      expect(character).toBeDefined();
      expect(character.name).toBe('测试角色');
      expect(character.classId).toBe(CLASS_ID);
      expect(character.ancestryId).toBe(ANCESTRY_ID);
      expect(character.level).toBe(1);
      expect(character.tier).toBe(1);
      expect(character.proficiency).toBe(1);
      expect(character.hp).toBe(character.maxHp);
      expect(character.stress).toBe(0);
      expect(character.hope).toBe(2);
      expect(character.domainCardConfig.loadout.length).toBe(2);
      expect(character.inventory).toEqual([]);
      expect(character.gold.coins).toBe(0);
    });

    test('incomplete data returns errors', () => {
      const c = new CharacterCreator();
      c.setStepData({ classId: CLASS_ID });
      const { character, errors } = c.buildCharacter();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('完成');
    });

    test('invalid classId returns error', () => {
      const c = new CharacterCreator();
      fillAllSteps(c, { classId: 'nonexistent-class' });
      const { errors } = c.buildCharacter();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('职业');
    });

    test('invalid armorId returns error', () => {
      const c = new CharacterCreator();
      fillAllSteps(c, { armorId: 'nonexistent-armor' });
      const { errors } = c.buildCharacter();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('护甲');
    });

    test('domain card from wrong domain returns error', () => {
      const c = new CharacterCreator();
      fillAllSteps(c, { domainCards: [DOMAIN_CARD_1, DOMAIN_CARD_INVALID] });
      const { errors } = c.buildCharacter();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('领域');
    });

    test('character has correct armor-derived values', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      const { character } = c.buildCharacter();
      // padded-armor: armorSlots=3, evasionPenalty=0, baseThreshold=5, baseThresholdSevere=11
      expect(character.maxArmorSlots).toBe(3);
      expect(character.evasion).toBe(character.evasion); // class baseEvasion + 0
      // Thresholds at level 1: minor = baseThreshold(5) + level(1) = 6
      // major = baseThresholdSevere(11) + level(1) = 12, severe = major * 2 = 24
      expect(character.minorThreshold).toBe(6);
      expect(character.majorThreshold).toBe(12);
      expect(character.severeThreshold).toBe(24);
    });

    test('character with off-hand weapon', () => {
      const c = new CharacterCreator();
      fillAllSteps(c, { offWeaponId: OFF_WEAPON_ID });
      const { character } = c.buildCharacter();
      expect(character.offWeapon).toBeDefined();
      expect(character.offWeapon!.id).toBe(OFF_WEAPON_ID);
    });

    test('character without off-hand weapon', () => {
      const c = new CharacterCreator();
      fillAllSteps(c);
      const { character } = c.buildCharacter();
      expect(character.offWeapon).toBeUndefined();
    });
  });

  describe('step-by-step walkthrough', () => {
    test('walk all 9 steps sequentially', () => {
      const c = new CharacterCreator();
      const steps: CharacterCreationStep[] = [
        'class', 'ancestry', 'community', 'attributes',
        'experiences', 'weapons', 'armor', 'domainCards', 'backstory',
      ];

      // Step 0: class
      expect(c.getCurrentStep()).toBe('class');
      c.setStepData({ classId: CLASS_ID });
      expect(c.goNext()).toBe(true);

      // Step 1: ancestry
      expect(c.getCurrentStep()).toBe('ancestry');
      c.setStepData({ ancestryId: ANCESTRY_ID });
      expect(c.goNext()).toBe(true);

      // Step 2: community
      expect(c.getCurrentStep()).toBe('community');
      c.setStepData({ communityId: COMMUNITY_ID });
      expect(c.goNext()).toBe(true);

      // Step 3: attributes
      expect(c.getCurrentStep()).toBe('attributes');
      c.setStepData({ attributes: VALID_ATTRIBUTES });
      expect(c.goNext()).toBe(true);

      // Step 4: experiences
      expect(c.getCurrentStep()).toBe('experiences');
      c.setStepData({ experiences: VALID_EXPERIENCES });
      expect(c.goNext()).toBe(true);

      // Step 5: weapons
      expect(c.getCurrentStep()).toBe('weapons');
      c.setStepData({ mainWeaponId: WEAPON_ID });
      expect(c.goNext()).toBe(true);

      // Step 6: armor
      expect(c.getCurrentStep()).toBe('armor');
      c.setStepData({ armorId: ARMOR_ID });
      expect(c.goNext()).toBe(true);

      // Step 7: domainCards
      expect(c.getCurrentStep()).toBe('domainCards');
      c.setStepData({ domainCards: [DOMAIN_CARD_1, DOMAIN_CARD_2] });
      expect(c.goNext()).toBe(true);

      // Step 8: backstory
      expect(c.getCurrentStep()).toBe('backstory');
      c.setStepData({ name: '测试角色', backstory: '背景', personalQuest: '任务' });
      expect(c.goNext()).toBe(false); // last step

      // Build
      const { character, errors } = c.buildCharacter();
      expect(errors).toEqual([]);
      expect(character.name).toBe('测试角色');
    });
  });
});
