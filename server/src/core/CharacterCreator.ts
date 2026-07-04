import { v4 as uuidv4 } from 'uuid';
import type {
  Attribute,
  Character,
  Experience,
  DomainCard,
  ClassData,
  ArmorData,
  WeaponData,
  CharacterCore,
  SystemCharacter,
  CreationFlowDef,
  AncestryFeature,
  CommunityFeature,
} from '@trpgmaster/shared';
import { getTier, calculateThresholds } from '@trpgmaster/shared';
import { validateCharacterSheet } from '../rules/systems/DaggerHeartRules';
import daggerheartData from '../rules/data/daggerheart';
import { getRulesEngine } from '../rules/RulesEngineFactory';
import type { IRulesEngine } from '../rules/IRulesEngine';
import { collectTraitEffects, getPermanentResourceBonuses } from '../rules/systems/traitEffects';

// ===== 旧 API 类型（向后兼容） =====

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
  mixedAncestryFeature1?: string;
  mixedAncestryFeature2?: string;
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
  private rulesEngine: IRulesEngine;

  constructor(rulesEngine?: IRulesEngine) {
    this.rulesEngine = rulesEngine ?? getRulesEngine('daggerheart');
    this.state = {
      currentStep: 0,
      totalSteps: CREATION_STEPS.length,
      data: {},
      errors: {},
    };
  }

  /** 获取当前规则系统的创建流程定义 */
  getCreationFlow(): CreationFlowDef {
    return this.rulesEngine.getCreationFlow();
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
    // 委托给 IRulesEngine 的通用验证
    const flow = this.rulesEngine.getCreationFlow();
    const currentStepDef = flow.steps[this.state.currentStep];
    const expectedStep = CREATION_STEPS[this.state.currentStep];
    // Only delegate if the flow step matches the expected CREATION_STEPS step
    if (currentStepDef && currentStepDef.id === expectedStep) {
      return this.rulesEngine.validateCreationStep(currentStepDef.id, this.state.data as Record<string, unknown>);
    }
    // 回退到旧验证逻辑（向后兼容）
    return this.validateCurrentStepLegacy();
  }

  /** 旧验证逻辑，作为回退保留 */
  private validateCurrentStepLegacy(): Record<string, string[]> {
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
        // Rules: Ch1 "第七步" — initial 2 experiences, each +2 modifier
        if (!d.experiences || d.experiences.length < 2) {
          errors.experiences = ['至少需要2个经历'];
        } else {
          const allPlus2 = d.experiences.every(e => e.modifier === 2);
          if (!allPlus2) errors.experiences = ['初始经历的加值必须均为+2'];
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

  /**
   * 构建角色（向后兼容版本，返回 Character）
   * 内部委托给 IRulesEngine.buildCharacter() 然后转换为旧格式
   */
  buildCharacter(): { character: Character | null; errors: string[] } {
    const d = this.state.data;
    const errors: string[] = [];

    // experiences is optional — no creation step collects it, defaults to []
    if (!d.classId || !d.ancestryId || !d.communityId || !d.attributes ||
        !d.mainWeaponId || !d.armorId || !d.domainCards || !d.name) {
      errors.push('请完成所有创建步骤');
      return { character: null, errors };
    }

    // 构建 CharacterCore
    const core: CharacterCore = {
      id: uuidv4(),
      name: d.name,
      level: 1,
      backstory: d.backstory || '',
      personalQuest: d.personalQuest || '',
      relationships: [],
      adventureSummaries: [],
      systemVersions: {},
    };

    try {
      const sysChar = this.rulesEngine.buildCharacter(core, d as Record<string, unknown>);

      // 将 SystemCharacter 转回旧 Character 格式（向后兼容）
      const sd = sysChar.systemData as Record<string, unknown>;
      const character: Character = {
        id: core.id,
        name: core.name,
        level: core.level,
        ...sd,
        hp: sysChar.hp,
        maxHp: sysChar.maxHp,
        inventory: sysChar.inventory,
        backstory: core.backstory,
        personalQuest: core.personalQuest,
        relationships: core.relationships,
        adventureSummaries: core.adventureSummaries,
      } as Character;

      const validationErrors = validateCharacterSheet(character);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      }

      return { character, errors };
    } catch (e) {
      // 回退到旧构建逻辑
      return this.buildCharacterLegacy();
    }
  }

  /** 旧构建逻辑，作为回退保留 */
  private buildCharacterLegacy(): { character: Character | null; errors: string[] } {
    const d = this.state.data;
    const errors: string[] = [];

    // experiences is optional — no creation step collects it
    if (!d.classId || !d.ancestryId || !d.communityId || !d.attributes ||
        !d.mainWeaponId || !d.armorId || !d.domainCards || !d.name) {
      errors.push('请完成所有创建步骤');
      return { character: null, errors };
    }

    const level = 1;
    const tier = getTier(level);
    const proficiency = 1;

    const classData = daggerheartData.classes.find(c => c.id === d.classId) as ClassData | undefined;
    if (!classData) {
      errors.push(`未找到职业: ${d.classId}`);
      return { character: null, errors };
    }

    const armorData = daggerheartData.armor.find(a => a.id === d.armorId) as ArmorData | undefined;
    if (!armorData) {
      errors.push(`未找到护甲: ${d.armorId}`);
      return { character: null, errors };
    }

    const maxHp = classData.baseHp;
    const maxStress = classData.baseStress;
    const maxHope = 6;
    const maxArmorSlots = armorData.armorSlots;
    let evasion = classData.baseEvasion + armorData.evasionPenalty;

    // Apply permanent trait bonuses (e.g., Giant +1 HP, Human +1 Stress, Apefolk +1 Evasion)
    const ancestryData = daggerheartData.ancestries.find(a => a.id === d.ancestryId);
    const communityData = daggerheartData.communities.find(c => c.id === d.communityId);
    const traitSource: import('../rules/systems/traitEffects').CharacterTraitSource = {
      ancestryFeatures: (ancestryData?.features ?? []) as AncestryFeature[],
      communityFeature: (communityData?.feature ?? null) as CommunityFeature | null,
      classData: classData ?? null,
    };
    const allTraitEffects = collectTraitEffects(traitSource);
    const bonuses = getPermanentResourceBonuses(allTraitEffects);
    const effectiveMaxHp = maxHp + bonuses.hp;
    const effectiveMaxStress = maxStress + bonuses.stress;
    const effectiveMaxHope = maxHope + bonuses.hope;
    evasion += bonuses.evasion;

    const thresholds = calculateThresholds(
      armorData.baseThreshold,
      armorData.baseThresholdSevere,
      level
    );
    if (bonuses.thresholdBonus > 0 && proficiency) {
      thresholds.minor += proficiency;
      thresholds.major += proficiency;
      thresholds.severe += proficiency;
    }

    for (const card of d.domainCards) {
      if (!classData.domains.includes(card.domain)) {
        errors.push(`领域卡"${card.name}"的领域(${card.domain})不属于${classData.name}的可用领域`);
      }
    }

    const attributeMarks: Record<Attribute, boolean> = {
      agility: false, strength: false, finesse: false,
      instinct: false, presence: false, knowledge: false,
    };

    const character: Character = {
      id: uuidv4(),
      name: d.name,
      classId: d.classId,
      subclassId: '',
      ancestryId: d.ancestryId,
      secondAncestryId: d.secondAncestryId,
      mixedAncestryFeature1: d.mixedAncestryFeature1,
      mixedAncestryFeature2: d.mixedAncestryFeature2,
      communityId: d.communityId,
      level,
      tier,
      proficiency,
      attributes: d.attributes,
      attributeMarks,
      hp: effectiveMaxHp,
      maxHp: effectiveMaxHp,
      stress: 0,
      maxStress: effectiveMaxStress,
      hope: 2,
      maxHope: effectiveMaxHope,
      armorSlots: maxArmorSlots,
      maxArmorSlots,
      evasion,
      minorThreshold: thresholds.minor,
      majorThreshold: thresholds.major,
      severeThreshold: thresholds.severe,
      mainWeapon: daggerheartData.weapons.find(w => w.id === d.mainWeaponId) as WeaponData,
      offWeapon: d.offWeaponId ? daggerheartData.weapons.find(w => w.id === d.offWeaponId) as WeaponData : undefined,
      armor: armorData,
      inventory: [],
      gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
      experiences: d.experiences || [],
      domainCardConfig: { loadout: d.domainCards, vault: [], maxLoadout: 5 },
      featureUses: {},
      adventureSummaries: [],
      scars: [],
      conditions: [],
      resistances: [],
      reactionsUsed: 0,
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
