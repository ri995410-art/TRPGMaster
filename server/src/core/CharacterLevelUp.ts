import type {
  Attribute,
  Character,
  Experience,
  DomainCard,
  DomainType,
} from '@trpgmaster/shared';
import { getTier, calculateThresholds } from '@trpgmaster/shared';
import daggerheartData from '../rules/data/daggerheart';

// Upgrade options available during level-up
export type LevelUpOptionType =
  | 'increaseAttributes'     // +1 to two unmarked attributes, then mark them
  | 'increaseHp'             // +1 max HP slot permanently
  | 'increaseStress'         // +1 max stress slot permanently
  | 'improveExperiences'     // +1 to two experiences
  | 'gainDomainCard'         // Gain a domain card of level ≤ current level
  | 'increaseEvasion'        // +1 evasion permanently
  | 'gainSubclassCard'       // Gain next subclass card (advanced → mastery)
  | 'increaseProficiency'    // +1 proficiency (costs 2 upgrade slots)
  | 'multiclass';            // Multiclass into another profession (level 5+, costs 2 slots)

export interface LevelUpOption {
  type: LevelUpOptionType;
  label: string;
  description: string;
  slotCost: number; // Most cost 1, proficiency/multiclass cost 2
  available: boolean;
  reason?: string; // Why not available
  data?: Record<string, unknown>; // Additional data (e.g. which attributes to increase)
}

export interface LevelUpRequest {
  characterId: string;
  newLevel: number;
  options: LevelUpOptionType[]; // 2 options chosen (or 1 if one costs 2 slots)
  attributeChoices?: [Attribute, Attribute]; // For increaseAttributes
  experienceChoices?: [string, string]; // For improveExperiences: experience IDs
  domainCardChoice?: string; // For gainDomainCard: domain card ID
  domainCardSwap?: { add: string; remove: string }; // Swap domain card
  multiclassClassId?: string; // For multiclass: second class ID
  multiclassDomain?: string; // For multiclass: chosen domain from second class
}

export interface LevelUpResult {
  success: boolean;
  character?: Character;
  errors: string[];
  tierChanged: boolean;
  oldTier: number;
  newTier: number;
}

const ALL_ATTRIBUTES: Attribute[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export class CharacterLevelUp {
  /**
   * Get available upgrade options for a character at their next level
   */
  static getAvailableOptions(character: Character): LevelUpOption[] {
    const nextLevel = character.level + 1;
    const nextTier = getTier(nextLevel);
    const currentTier = getTier(character.level);
    const options: LevelUpOption[] = [];

    // 1. Increase two unmarked attributes
    const unmarkedAttrs = ALL_ATTRIBUTES.filter(a => !character.attributeMarks[a]);
    options.push({
      type: 'increaseAttributes',
      label: '提升两项属性',
      description: `选择两个未标记的属性获得+1加值并标记它们。可用属性：${unmarkedAttrs.map(a => a).join('、')}`,
      slotCost: 1,
      available: unmarkedAttrs.length >= 2,
      reason: unmarkedAttrs.length < 2 ? '没有足够的未标记属性' : undefined,
      data: { availableAttributes: unmarkedAttrs },
    });

    // 2. Increase HP slot
    options.push({
      type: 'increaseHp',
      label: '增加生命槽',
      description: '永久增加1个生命点上限',
      slotCost: 1,
      available: true,
    });

    // 3. Increase stress slot
    options.push({
      type: 'increaseStress',
      label: '增加压力槽',
      description: '永久增加1个压力点上限',
      slotCost: 1,
      available: true,
    });

    // 4. Improve experiences
    const experiences = character.experiences;
    options.push({
      type: 'improveExperiences',
      label: '提升经历',
      description: '选择两项经历各获得+1加值',
      slotCost: 1,
      available: experiences.length >= 2,
      reason: experiences.length < 2 ? '至少需要2项经历' : undefined,
      data: { experienceIds: experiences.map(e => e.id) },
    });

    // 5. Gain domain card
    const classData = daggerheartData.classes.find(c => c.id === character.classId);
    const classDomains = classData?.domains || [];
    const availableDomainCards = (daggerheartData.domains as DomainCard[]).filter(
      (c: DomainCard) => {
        if (!classDomains.includes(c.domain)) return false;
        // Rules: Ch2 "兼职规则" — multiclass domain cards capped at ceil(level/2)
        const levelLimit = character.multiclass && character.multiclass.domain === c.domain
          ? Math.ceil(nextLevel / 2)
          : nextLevel;
        return c.level <= levelLimit;
      },
    );
    options.push({
      type: 'gainDomainCard',
      label: '获取领域卡',
      description: `从你的领域(${classDomains.join('、')})中选择一张等级≤${nextLevel}的领域卡`,
      slotCost: 1,
      available: availableDomainCards.length > 0,
      reason: availableDomainCards.length === 0 ? '没有可用的领域卡' : undefined,
      data: { availableCards: availableDomainCards.map(c => c.id) },
    });

    // 6. Increase evasion
    options.push({
      type: 'increaseEvasion',
      label: '提升闪避',
      description: '永久获得+1闪避值',
      slotCost: 1,
      available: true,
    });

    // 7. Gain subclass card
    // Rules: Ch2 "兼职规则" — multiclass only blocks original class mastery cards, not all subclass cards
    const isMulticlassMasteryBlock = character.multiclass
      && !character.featureUses?.[`subclass_mastery_${character.subclassId}`];
    options.push({
      type: 'gainSubclassCard',
      label: '获取子职业卡牌',
      description: '获得子职业的下一张卡牌（进阶→精通）',
      slotCost: 1,
      available: !isMulticlassMasteryBlock,
      reason: isMulticlassMasteryBlock ? '兼职后不能获得原职业的精通卡' : undefined,
    });

    // 8. Increase proficiency (costs 2 slots)
    options.push({
      type: 'increaseProficiency',
      label: '提升熟练值',
      description: '熟练值+1，武器伤害骰数量+1。此选项占用2个升级槽位。',
      slotCost: 2,
      available: true,
    });

    // 9. Multiclass (level 5+, costs 2 slots)
    options.push({
      type: 'multiclass',
      label: '兼职',
      description: '从另一个职业中选择一个领域，获得其职业特性。此选项占用2个升级槽位。',
      slotCost: 2,
      available: nextLevel >= 5 && !character.multiclass,
      reason: nextLevel < 5 ? '5级才能选择兼职' : character.multiclass ? '已经兼职，不能再次兼职' : undefined,
      data: { availableClasses: daggerheartData.classes.filter((c: any) => c.id !== character.classId).map((c: any) => ({ id: c.id, name: c.name })) },
    });

    return options;
  }

  /**
   * Get tier advancement bonuses for a specific level
   */
  static getTierAdvancementBonuses(level: number): {
    extraExperience?: { modifier: number };
    proficiencyBonus?: number;
    clearAttributeMarks: boolean;
  } {
    return {
      extraExperience: (level === 2 || level === 5 || level === 8) ? { modifier: 2 } : undefined,
      proficiencyBonus: (level === 2 || level === 5 || level === 8) ? 1 : undefined,
      clearAttributeMarks: level === 5 || level === 8,
    };
  }

  /**
   * Execute a level-up for a character
   */
  static levelUp(character: Character, request: LevelUpRequest): LevelUpResult {
    const errors: string[] = [];
    const oldTier = getTier(character.level);
    const newTier = getTier(request.newLevel);

    // Validate level increment
    if (request.newLevel !== character.level + 1) {
      errors.push(`升级必须逐级进行，当前等级${character.level}，目标等级应为${character.level + 1}`);
      return { success: false, errors, tierChanged: false, oldTier, newTier };
    }

    if (request.newLevel > 10) {
      errors.push('最高等级为10级');
      return { success: false, errors, tierChanged: false, oldTier, newTier };
    }

    // Validate slot cost: 2 upgrade slots per level
    const totalSlotCost = request.options.reduce((sum, opt) => {
      const optionDef = this.getAvailableOptions(character).find(o => o.type === opt);
      return sum + (optionDef?.slotCost || 1);
    }, 0);

    if (totalSlotCost !== 2) {
      errors.push(`升级选项必须恰好占用2个槽位，当前占用${totalSlotCost}个`);
      return { success: false, errors, tierChanged: false, oldTier, newTier };
    }

    // Apply tier advancement bonuses first
    const bonuses = this.getTierAdvancementBonuses(request.newLevel);

    // Deep clone character
    const updated: Character = JSON.parse(JSON.stringify(character));
    updated.level = request.newLevel;
    updated.tier = newTier;

    // Apply tier advancement
    if (bonuses.extraExperience) {
      updated.experiences.push({
        id: `exp_${Date.now()}`,
        name: '新经历',
        modifier: bonuses.extraExperience.modifier,
      });
    }

    if (bonuses.proficiencyBonus) {
      updated.proficiency += bonuses.proficiencyBonus;
    }

    if (bonuses.clearAttributeMarks) {
      for (const attr of ALL_ATTRIBUTES) {
        updated.attributeMarks[attr] = false;
      }
    }

    // Apply chosen upgrade options
    for (const optionType of request.options) {
      switch (optionType) {
        case 'increaseAttributes': {
          if (!request.attributeChoices || request.attributeChoices.length !== 2) {
            errors.push('请选择两项属性提升');
            continue;
          }
          const [attr1, attr2] = request.attributeChoices;
          if (updated.attributeMarks[attr1] || updated.attributeMarks[attr2]) {
            errors.push('不能选择已标记的属性');
            continue;
          }
          updated.attributes[attr1] += 1;
          updated.attributes[attr2] += 1;
          updated.attributeMarks[attr1] = true;
          updated.attributeMarks[attr2] = true;
          break;
        }

        case 'increaseHp': {
          updated.maxHp += 1;
          updated.hp += 1; // Also increase current HP
          break;
        }

        case 'increaseStress': {
          updated.maxStress += 1;
          break;
        }

        case 'improveExperiences': {
          if (!request.experienceChoices || request.experienceChoices.length !== 2) {
            errors.push('请选择两项经历提升');
            continue;
          }
          for (const expId of request.experienceChoices) {
            const exp = updated.experiences.find(e => e.id === expId);
            if (exp) {
              exp.modifier += 1;
            } else {
              errors.push(`未找到经历: ${expId}`);
            }
          }
          break;
        }

        case 'gainDomainCard': {
          const cardId = request.domainCardChoice || request.domainCardSwap?.add;
          if (!cardId) {
            errors.push('请选择一张领域卡');
            continue;
          }
          const card = (daggerheartData.domains as DomainCard[]).find((c: DomainCard) => c.id === cardId);
          if (!card) {
            errors.push(`未找到领域卡: ${cardId}`);
            continue;
          }
          // Rules: Ch2 "兼职规则" — multiclass domain cards capped at ceil(level/2)
          const effectiveLevelLimit = updated.multiclass && updated.multiclass.domain === card.domain
            ? Math.ceil(request.newLevel / 2)
            : request.newLevel;
          if (card.level > effectiveLevelLimit) {
            errors.push(`领域卡等级(${card.level})超过可用等级上限(${effectiveLevelLimit})${updated.multiclass?.domain === card.domain ? '（兼职领域卡限制为等级一半向上取整）' : ''}`);
            continue;
          }
          // Validate domain belongs to class
          const classData = daggerheartData.classes.find(c => c.id === updated.classId);
          if (classData && !classData.domains.includes(card.domain)) {
            errors.push(`领域卡"${card.name}"的领域(${card.domain})不属于你的职业可用领域`);
            continue;
          }
          // Handle swap or direct add
          if (request.domainCardSwap?.remove) {
            const removeIdx = updated.domainCardConfig.loadout.findIndex((c: DomainCard) => c.id === request.domainCardSwap!.remove);
            if (removeIdx >= 0) {
              updated.domainCardConfig.loadout.splice(removeIdx, 1);
            } else {
              errors.push(`未找到要替换的领域卡: ${request.domainCardSwap.remove}`);
            }
          }
          updated.domainCardConfig.loadout.push(card);
          break;
        }

        case 'increaseEvasion': {
          updated.evasion += 1;
          break;
        }

        case 'gainSubclassCard': {
          // Unlock the next subclass feature tier based on current level
          const subclassData = daggerheartData.subclasses?.find(
            (sc: any) => sc.id === updated.subclassId,
          );
          if (subclassData && subclassData.features) {
            const { features } = subclassData;
            // Determine which tier to unlock next
            // base=1, advanced=5, mastery=8
            let nextFeature: { name: string; nameEn: string; description: string; level: number; isCard: boolean } | null = null;
            if (request.newLevel >= 5 && !updated.featureUses[`subclass_advanced_${updated.subclassId}`]) {
              nextFeature = features.advanced;
            } else if (request.newLevel >= 8 && !updated.featureUses[`subclass_mastery_${updated.subclassId}`]) {
              nextFeature = features.mastery;
            } else if (!updated.featureUses[`subclass_base_${updated.subclassId}`]) {
              nextFeature = features.base;
            }
            if (nextFeature) {
              // Mark the feature as unlocked
              const featureKey = request.newLevel >= 8 ? `subclass_mastery_${updated.subclassId}`
                : request.newLevel >= 5 ? `subclass_advanced_${updated.subclassId}`
                : `subclass_base_${updated.subclassId}`;
              updated.featureUses[featureKey] = -1; // -1 = passive/unlimited uses
              // If the feature is a card, add it to the domain card loadout
              if (nextFeature.isCard) {
                // Create a synthetic domain card for the subclass feature
                const card: DomainCard = {
                  id: `${updated.subclassId}_${featureKey}`,
                  name: nextFeature.name,
                  nameEn: nextFeature.nameEn,
                  domain: (daggerheartData.classes.find((c: any) => c.id === updated.classId)?.domains?.[0] as DomainType) || 'codex',
                  level: nextFeature.level || request.newLevel,
                  type: 'ability',
                  recallCost: 0,
                  description: nextFeature.description,
                  effect: nextFeature.description,
                };
                if (updated.domainCardConfig.loadout.length < updated.domainCardConfig.maxLoadout) {
                  updated.domainCardConfig.loadout.push(card);
                } else {
                  updated.domainCardConfig.vault.push(card);
                }
              }
            } else {
              errors.push('没有可解锁的子职业特性');
            }
          } else {
            errors.push(`未找到子职业数据: ${updated.subclassId}`);
          }
          break;
        }

        case 'increaseProficiency': {
          updated.proficiency += 1;
          break;
        }

        case 'multiclass': {
          // Rules: Ch2 "兼职规则" — gain another class's base subclass card, choose a domain from it
          const secondClassId = request.multiclassClassId;
          if (!secondClassId) {
            errors.push('请选择一个兼职职业');
            break;
          }
          if (updated.multiclass) {
            errors.push('角色已经兼职，不能再次兼职');
            break;
          }
          const secondClassData = daggerheartData.classes.find((c: any) => c.id === secondClassId);
          if (!secondClassData) {
            errors.push(`未找到职业: ${secondClassId}`);
            break;
          }
          // Find domains from the second class that the character doesn't already have
          const currentClassData = daggerheartData.classes.find((c: any) => c.id === updated.classId);
          const currentDomains = currentClassData?.domains || [];
          const newDomains = (secondClassData.domains as DomainType[]).filter(
            (d: DomainType) => !currentDomains.includes(d),
          );
          if (newDomains.length === 0) {
            errors.push(`职业 ${secondClassData.name} 的领域与当前职业完全重叠`);
            break;
          }
          // Pick the selected domain, or the first available
          const selectedDomain: DomainType = (request.multiclassDomain as DomainType) || newDomains[0];
          if (!newDomains.includes(selectedDomain)) {
            errors.push(`领域 ${selectedDomain} 不属于职业 ${secondClassData.name} 或已被当前职业拥有`);
            break;
          }
          updated.multiclass = {
            classId: secondClassId,
            domain: selectedDomain,
          };

          // Rules: Ch2 "兼职规则" — gain the second class's base subclass card
          const secondSubclassIds = secondClassData.subclassIds as [string, string];
          if (secondSubclassIds && secondSubclassIds.length > 0) {
            const secondSubclass = daggerheartData.subclasses?.find(
              (sc: any) => sc.id === secondSubclassIds[0],
            );
            if (secondSubclass?.features?.base) {
              const baseFeature = secondSubclass.features.base;
              if (baseFeature.isCard) {
                const card: DomainCard = {
                  id: `multiclass_${secondSubclass.id}_base`,
                  name: baseFeature.name,
                  nameEn: baseFeature.nameEn,
                  domain: selectedDomain,
                  level: baseFeature.level || 1,
                  type: 'ability',
                  recallCost: 0,
                  description: baseFeature.description,
                  effect: baseFeature.description,
                };
                if (updated.domainCardConfig.loadout.length < updated.domainCardConfig.maxLoadout) {
                  updated.domainCardConfig.loadout.push(card);
                } else {
                  updated.domainCardConfig.vault.push(card);
                }
              }
              // Mark the base feature as unlocked
              updated.featureUses[`subclass_base_${secondSubclass.id}`] = -1;
            }
          }
          break;
        }
      }
    }

    // Update damage thresholds (threshold = base + level)
    const armorData = updated.armor;
    if (armorData) {
      const thresholds = calculateThresholds(
        armorData.baseThreshold,
        armorData.baseThresholdSevere,
        updated.level,
      );
      updated.minorThreshold = thresholds.minor;
      updated.majorThreshold = thresholds.major;
      updated.severeThreshold = thresholds.severe;
    }

    if (errors.length > 0) {
      return { success: false, errors, tierChanged: oldTier !== newTier, oldTier, newTier };
    }

    return {
      success: true,
      character: updated,
      errors: [],
      tierChanged: oldTier !== newTier,
      oldTier,
      newTier,
    };
  }
}
