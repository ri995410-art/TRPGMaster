import { CharacterCreator } from '../src/core/CharacterCreator';
import type { Attribute, Experience, DomainCard } from '@trpgmaster/shared';

describe('CharacterCreator', () => {
  let creator: CharacterCreator;

  beforeEach(() => {
    creator = new CharacterCreator('daggerheart');
  });

  describe('initial state', () => {
    it('starts at step 0 (class)', () => {
      expect(creator.getStepIndex()).toBe(0);
      expect(creator.getCurrentStep()).toBe('class');
    });

    it('has 9 total steps', () => {
      expect(creator.getState().totalSteps).toBe(9);
    });

    it('cannot go back from step 0', () => {
      expect(creator.canGoBack()).toBe(false);
    });
  });

  describe('step navigation', () => {
    it('can go next when current step is valid', () => {
      creator.setStepData({ classId: 'warrior' });
      expect(creator.canGoNext()).toBe(true);
    });

    it('cannot go next when current step is invalid', () => {
      expect(creator.canGoNext()).toBe(false);
    });

    it('advances to next step', () => {
      creator.setStepData({ classId: 'warrior' });
      expect(creator.goNext()).toBe(true);
      expect(creator.getCurrentStep()).toBe('ancestry');
    });

    it('can go back', () => {
      creator.setStepData({ classId: 'warrior' });
      creator.goNext();
      expect(creator.canGoBack()).toBe(true);
      expect(creator.goBack()).toBe(true);
      expect(creator.getCurrentStep()).toBe('class');
    });
  });

  describe('step validation', () => {
    it('validates class step', () => {
      const errors = creator.validateCurrentStep();
      expect(errors.classId).toBeDefined();
      creator.setStepData({ classId: 'warrior' });
      const noErrors = creator.validateCurrentStep();
      expect(noErrors.classId).toBeUndefined();
    });

    it('validates ancestry step', () => {
      creator.setStepData({ classId: 'warrior' });
      creator.goNext();
      const errors = creator.validateCurrentStep();
      expect(errors.ancestryId).toBeDefined();
    });

    it('validates community step', () => {
      creator.setStepData({ classId: 'warrior' });
      creator.goNext();
      creator.setStepData({ ancestryId: 'elf' });
      creator.goNext();
      const errors = creator.validateCurrentStep();
      expect(errors.communityId).toBeDefined();
    });

    it('validates attributes step - requires +2,+1,+1,0,0,-1 distribution', () => {
      // Navigate to attributes step by filling previous steps
      fillStepsToAttributes(creator);
      const badAttributes = {
        agility: 2, strength: 2, finesse: 0, instinct: 0, presence: -1, knowledge: 0,
      };
      creator.setStepData({ attributes: badAttributes });
      const errors = creator.validateCurrentStep();
      expect(errors.attributes).toBeDefined();
    });

    it('accepts valid attribute distribution', () => {
      fillStepsToAttributes(creator);
      const goodAttributes: Record<Attribute, number> = {
        agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1,
      };
      creator.setStepData({ attributes: goodAttributes });
      const errors = creator.validateCurrentStep();
      expect(errors.attributes).toBeUndefined();
    });

    it('validates experiences - needs +2 and at least one +1', () => {
      fillStepsToExperiences(creator);
      const badExperiences: Experience[] = [
        { id: 'exp1', name: 'test', modifier: 1 },
      ];
      creator.setStepData({ experiences: badExperiences });
      const errors = creator.validateCurrentStep();
      expect(errors.experiences).toBeDefined();
    });

    it('accepts valid experiences', () => {
      fillStepsToExperiences(creator);
      const goodExperiences: Experience[] = [
        { id: 'exp1', name: '战斗训练', modifier: 2 },
        { id: 'exp2', name: '街头生活', modifier: 1 },
      ];
      creator.setStepData({ experiences: goodExperiences });
      const errors = creator.validateCurrentStep();
      expect(errors.experiences).toBeUndefined();
    });

    it('validates weapons step', () => {
      fillStepsToWeapons(creator);
      const errors = creator.validateCurrentStep();
      expect(errors.mainWeaponId).toBeDefined();
    });

    it('validates armor step', () => {
      fillStepsToArmor(creator);
      const errors = creator.validateCurrentStep();
      expect(errors.armorId).toBeDefined();
    });

    it('validates domain cards - at least 2, max 5', () => {
      fillStepsToDomainCards(creator);
      let errors = creator.validateCurrentStep();
      expect(errors.domainCards).toBeDefined();

      const tooMany: DomainCard[] = Array.from({ length: 6 }, (_, i) => ({
        id: `card_${i}`, name: `Card ${i}`, nameEn: `Card ${i}`,
        domain: 'arcane' as const, level: 1, type: 'spell' as const,
        cost: '0', recallCost: 0, description: 'test', effect: 'test',
      }));
      creator.setStepData({ domainCards: tooMany });
      errors = creator.validateCurrentStep();
      expect(errors.domainCards).toBeDefined();
    });

    it('validates backstory step - name required', () => {
      fillStepsToBackstory(creator);
      const errors = creator.validateCurrentStep();
      expect(errors.name).toBeDefined();
    });
  });

  describe('buildCharacter', () => {
    it('creates a complete character from valid data', () => {
      fillAllSteps(creator);

      const { character, errors } = creator.buildCharacter('player-1');
      expect(errors.length).toBe(0);
      expect(character.name).toBe('艾拉·银盾');
      expect(character.classId).toBe('warrior');
      expect(character.level).toBe(1);
      expect(character.tier).toBe(1);
      expect(character.proficiency).toBe(1);
      expect(character.hp).toBe(character.maxHp);
      expect(character.stress).toBe(0);
      expect(character.hope).toBe(2);
      expect(character.corruption).toBe(0);
    });

    it('returns errors for incomplete data', () => {
      const { errors } = creator.buildCharacter('player-1');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('goToStep', () => {
    it('jumps to step if all previous steps are valid', () => {
      creator.setStepData({ classId: 'warrior' });
      expect(creator.goToStep(1)).toBe(true);
      expect(creator.getCurrentStep()).toBe('ancestry');
    });

    it('rejects jump if previous steps are invalid', () => {
      expect(creator.goToStep(3)).toBe(false);
      expect(creator.getCurrentStep()).toBe('class');
    });
  });
});

// Helper functions to fill steps progressively

function fillStepsToAttributes(creator: CharacterCreator) {
  creator.setStepData({ classId: 'warrior' });
  creator.goNext();
  creator.setStepData({ ancestryId: 'elf' });
  creator.goNext();
  creator.setStepData({ communityId: 'high-city' });
  creator.goNext();
}

function fillStepsToExperiences(creator: CharacterCreator) {
  fillStepsToAttributes(creator);
  creator.setStepData({
    attributes: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
  });
  creator.goNext();
}

function fillStepsToWeapons(creator: CharacterCreator) {
  fillStepsToExperiences(creator);
  creator.setStepData({
    experiences: [
      { id: 'exp1', name: '战斗训练', modifier: 2 },
      { id: 'exp2', name: '街头生活', modifier: 1 },
    ],
  });
  creator.goNext();
}

function fillStepsToArmor(creator: CharacterCreator) {
  fillStepsToWeapons(creator);
  creator.setStepData({ mainWeaponId: 'longsword' });
  creator.goNext();
}

function fillStepsToDomainCards(creator: CharacterCreator) {
  fillStepsToArmor(creator);
  creator.setStepData({ armorId: 'chain-armor' });
  creator.goNext();
}

function fillStepsToBackstory(creator: CharacterCreator) {
  fillStepsToDomainCards(creator);
  creator.setStepData({
    domainCards: [{
      id: 'blade_dance', name: '刀锋之舞', nameEn: 'Blade Dance',
      domain: 'blade' as const, level: 1, type: 'ability' as const, cost: '0',
      recallCost: 0, description: 'test', effect: 'test',
    }, {
      id: 'blade_riposte', name: '招架反击', nameEn: 'Riposte',
      domain: 'blade' as const, level: 1, type: 'ability' as const, cost: '0',
      recallCost: 1, description: 'test', effect: 'test',
    }],
  });
  creator.goNext();
}

function fillAllSteps(creator: CharacterCreator) {
  creator.setStepData({
    classId: 'warrior',
    ancestryId: 'human',
    communityId: 'high-city',
    attributes: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
    experiences: [
      { id: 'exp1', name: '战斗训练', modifier: 2 },
      { id: 'exp2', name: '街头生活', modifier: 1 },
    ],
    mainWeaponId: 'longsword',
    armorId: 'chain-armor',
    domainCards: [{
      id: 'blade_dance', name: '刀锋之舞', nameEn: 'Blade Dance',
      domain: 'blade' as const, level: 1, type: 'ability' as const, cost: '0',
      recallCost: 0, description: 'test', effect: 'test',
    }],
    name: '艾拉·银盾',
    backstory: '一个来自高城的战士',
    personalQuest: '寻找失落的家族宝剑',
  });
}
