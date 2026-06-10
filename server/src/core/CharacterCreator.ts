import { v4 as uuidv4 } from 'uuid';
import type {
  Attribute,
  Character,
  Experience,
  DomainCard,
  CorruptionLevel,
  RuleSystemId,
  ClassData,
  ArmorData,
  Ancestry as AncestryType,
} from '@trpgmaster/shared';
import { getTier, calculateThresholds } from '@trpgmaster/shared';
import { validateCharacterSheet } from '../rules/systems/DaggerHeartRules';
import daggerheartData from '../rules/data/daggerheart';

export type CharacterCreationStep =
  | 'class'
  | 'ancestry'
  | 'community'
  | 'attributes'
  | 'experiences'
  | 'weapons'
  | 'armor'
  | 'domainCards'
  | 'backstory';

const CREATION_STEPS: CharacterCreationStep[] = [
  'class',
  'ancestry',
  'community',
  'attributes',
  'experiences',
  'weapons',
  'armor',
  'domainCards',
  'backstory',
];

export interface CharacterCreationState {
  currentStep: number;
  totalSteps: number;
  data: Partial<CharacterCreationData>;
  errors: Record<string, string[]>;
}

export interface CharacterCreationData {
  classId: string;
  ancestryId: string;
  secondAncestryId?: string;
  mixedAncestryFeature1?: string; // Feature picked from first ancestry (for mixed ancestry)
  mixedAncestryFeature2?: string; // Feature picked from second ancestry (for mixed ancestry)
  communityId: string;
  attributes: Record<Attribute, number>;
  experiences: Experience[];
  mainWeaponId: string;
  offWeaponId?: string;
  armorId: string;
  domainCards: DomainCard[];
  name: string;
  backstory: string;
  personalQuest: string;
}

const VALID_ATTRIBUTE_DISTRIBUTION = [2, 1, 1, 0, 0, -1];
const ALL_ATTRIBUTES: Attribute[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export class CharacterCreator {
  private state: CharacterCreationState;
  private ruleSystem: RuleSystemId;

  constructor(ruleSystem: RuleSystemId = 'daggerheart') {
    this.ruleSystem = ruleSystem;
    this.state = {
      currentStep: 0,
      totalSteps: CREATION_STEPS.length,
      data: {},
      errors: {},
    };
  }

  getState(): CharacterCreationState {
    return { ...this.state };
  }

  getCurrentStep(): CharacterCreationStep {
    return CREATION_STEPS[this.state.currentStep];
  }

  getStepIndex(): number {
    return this.state.currentStep;
  }

  canGoNext(): boolean {
    const errors = this.validateCurrentStep();
    return Object.keys(errors).length === 0;
  }

  canGoBack(): boolean {
    return this.state.currentStep > 0;
  }

  goNext(): boolean {
    if (!this.canGoNext()) return false;
    if (this.state.currentStep >= CREATION_STEPS.length - 1) return false;
    this.state.currentStep++;
    return true;
  }

  goBack(): boolean {
    if (!this.canGoBack()) return false;
    this.state.currentStep--;
    return true;
  }

  goToStep(step: number): boolean {
    if (step < 0 || step >= CREATION_STEPS.length) return false;
    // Validate all steps up to the target
    for (let i = 0; i < step; i++) {
      const savedStep = this.state.currentStep;
      this.state.currentStep = i;
      const errors = this.validateCurrentStep();
      this.state.currentStep = savedStep;
      if (Object.keys(errors).length > 0) return false;
    }
    this.state.currentStep = step;
    return true;
  }

  setStepData(data: Partial<CharacterCreationData>): void {
    this.state.data = { ...this.state.data, ...data };
    this.state.errors = this.validateCurrentStep();
  }

  validateCurrentStep(): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const step = this.getCurrentStep();
    const d = this.state.data;

    switch (step) {
      case 'class':
        if (!d.classId) errors.classId = ['请选择一个职业'];
        break;
      case 'ancestry':
        if (!d.ancestryId) errors.ancestryId = ['请选择一个血统'];
        break;
      case 'community':
        if (!d.communityId) errors.communityId = ['请选择一个社区'];
        break;
      case 'attributes':
        if (!d.attributes || Object.keys(d.attributes).length !== 6) {
          errors.attributes = ['请分配所有6个属性'];
        } else {
          const values = ALL_ATTRIBUTES.map(a => d.attributes![a]).sort((a, b) => b - a);
          if (!values.every((v, i) => v === VALID_ATTRIBUTE_DISTRIBUTION[i])) {
            errors.attributes = ['属性分配必须为+2,+1,+1,0,0,-1的排列'];
          }
        }
        break;
      case 'experiences':
        if (!d.experiences || d.experiences.length < 2) {
          errors.experiences = ['至少需要2个经历'];
        } else {
          const hasPlus2 = d.experiences.some(e => e.modifier === 2);
          const plus1Count = d.experiences.filter(e => e.modifier === 1).length;
          if (!hasPlus2) errors.experiences = ['需要一个+2经历'];
          if (plus1Count < 1) errors.experiences = ['至少需要一个+1经历'];
        }
        break;
      case 'weapons':
        if (!d.mainWeaponId) errors.mainWeaponId = ['请选择主手武器'];
        break;
      case 'armor':
        if (!d.armorId) errors.armorId = ['请选择护甲'];
        break;
      case 'domainCards':
        if (!d.domainCards || d.domainCards.length < 2) {
          errors.domainCards = ['至少选择2张领域卡'];
        } else if (d.domainCards.length > 5) {
          errors.domainCards = ['最多配置5张领域卡'];
        } else {
          // Level 1 characters can only select Level 1 domain cards
          const hasNonLevel1 = d.domainCards.some(c => c.level !== 1);
          if (hasNonLevel1) {
            errors.domainCards = ['一级角色只能选择一级领域卡'];
          }
        }
        break;
      case 'backstory':
        if (!d.name || d.name.trim().length === 0) {
          errors.name = ['请输入角色名称'];
        }
        break;
    }

    return errors;
  }

  buildCharacter(playerId: string): { character: Character; errors: string[] } {
    const d = this.state.data;
    const errors: string[] = [];

    if (!d.classId || !d.ancestryId || !d.communityId || !d.attributes ||
        !d.experiences || !d.mainWeaponId || !d.armorId || !d.domainCards || !d.name) {
      errors.push('请完成所有创建步骤');
      return { character: null as unknown as Character, errors };
    }

    const level = 1;
    const tier = getTier(level);
    const proficiency = 1;

    // Look up class data from game data
    const classData = daggerheartData.classes.find(c => c.id === d.classId) as ClassData | undefined;
    if (!classData) {
      errors.push(`未找到职业: ${d.classId}`);
      return { character: null as unknown as Character, errors };
    }

    // Look up armor data from game data
    const armorData = daggerheartData.armor.find(a => a.id === d.armorId) as ArmorData | undefined;
    if (!armorData) {
      errors.push(`未找到护甲: ${d.armorId}`);
      return { character: null as unknown as Character, errors };
    }

    // Look up ancestry data for modifiers
    const ancestryData = daggerheartData.ancestries.find(a => a.id === d.ancestryId) as AncestryType | undefined;

    // Apply ancestry attribute modifiers (no half-modifiers for mixed ancestry — official rules)
    const finalAttributes = { ...d.attributes };
    if (ancestryData?.modifiers) {
      for (const [attr, mod] of Object.entries(ancestryData.modifiers)) {
        if (mod !== undefined && mod !== null) {
          finalAttributes[attr as Attribute] = (finalAttributes[attr as Attribute] || 0) + mod;
        }
      }
    }

    // Calculate resources from class data
    const maxHp = classData.baseHp;
    const maxStress = classData.baseStress;
    const maxHope = classData.baseHope;
    const maxArmorSlots = armorData.armorSlots;

    // Calculate evasion from class + armor penalty + ancestry
    let evasion = classData.baseEvasion + armorData.evasionPenalty;
    // Some ancestries give evasion bonus (e.g. apefolk +1)
    // This is handled through features, not modifiers, so we don't auto-apply

    // Calculate thresholds from armor data
    const thresholds = calculateThresholds(
      armorData.baseThreshold,
      armorData.baseThresholdSevere,
      level
    );

    // Validate domain cards belong to class domains
    for (const card of d.domainCards) {
      if (!classData.domains.includes(card.domain)) {
        errors.push(`领域卡"${card.name}"的领域(${card.domain})不属于${classData.name}的可用领域`);
      }
    }

    // Build attribute marks (all false initially)
    const attributeMarks: Record<Attribute, boolean> = {
      agility: false,
      strength: false,
      finesse: false,
      instinct: false,
      presence: false,
      knowledge: false,
    };

    const character: Character = {
      id: uuidv4(),
      playerId,
      name: d.name,
      ruleSystem: this.ruleSystem,
      classId: d.classId,
      subclassId: undefined,
      ancestryId: d.ancestryId,
      secondAncestryId: d.secondAncestryId,
      mixedAncestryFeature1: d.mixedAncestryFeature1,
      mixedAncestryFeature2: d.mixedAncestryFeature2,
      communityId: d.communityId,
      level,
      tier,
      proficiency,
      attributes: finalAttributes,
      attributeMarks,
      hp: maxHp,
      maxHp,
      stress: 0,
      maxStress,
      hope: 2,
      maxHope,
      armorSlots: maxArmorSlots,
      maxArmorSlots,
      evasion,
      majorThreshold: thresholds.major,
      severeThreshold: thresholds.severe,
      massiveThreshold: thresholds.massive,
      mainWeaponId: d.mainWeaponId,
      offWeaponId: d.offWeaponId,
      armorId: d.armorId,
      inventory: [],
      experiences: d.experiences,
      domainCards: d.domainCards,
      scars: [],
      conditions: [],
      resistances: [],
      reactionsUsed: 0,
      focusTokens: 0,
      corruption: 0 as CorruptionLevel,
      factionRelations: {},
      backstory: d.backstory || '',
      personalQuest: d.personalQuest || '',
      relationships: [],
    };

    const validationErrors = validateCharacterSheet(character);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
    }

    return { character, errors };
  }
}
