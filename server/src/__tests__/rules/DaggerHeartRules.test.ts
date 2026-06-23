/**
 * DaggerHeart Rules Engine - Unit Tests
 * Tests for all core mechanics: duality dice, damage, hope/fear, stress, rest, death moves, etc.
 */
import {
  rollDualD12,
  resolveRoll,
  rollAdvantageDisadvantage,
  resolveReactionRoll,
  calculateThresholds,
  calculateDamageSeverity,
  getHpLossFromSeverity,
  applyArmorSlot,
  calculateCriticalDamage,
  rollWeaponDamage,
  spendHope,
  gainHope,
  gainFearOnRest,
  applyStressOverflow,
  shouldApplyVulnerableOnStress,
  clearStress,
  getShortRestActions,
  getLongRestActions,
  executeRest,
  canShortRest,
  gloriousSacrifice,
  avoidDeath,
  desperateGamble,
  getLevelUpOptions,
  getTierUpBenefits,
  applyResistance,
  addCondition,
  removeCondition,
  tickConditions,
  hasCondition,
  recallDomainCard,
  swapDomainCard,
  tickCountdown,
  tickCountdowns,
  validateCharacterSheet,
  validateContaminationLevel,
  isContaminationTerminal,
  shouldDrawMutationCard,
  getExplorationTimer,
  getHazeReactionDifficulty,
  getContaminationRisk,
  getDeleriumContaminationRisk,
  getFactionRelationLabel,
  changeFactionRelation,
  calculateEvasion,
  rollDie,
  rollDice,
  rollDamageString,
  attributeToModifier,
  resolveDualityDice,
} from '../../rules/systems/DaggerHeartRules';
import type {
  ConditionInstance,
  Countdown,
  DomainCard,
  Resistance,
  Character,
} from '@trpgmaster/shared';

// ===== 二元骰系统 =====

describe('Duality Dice System', () => {
  describe('rollDualD12', () => {
    it('returns result within 2-24 range', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDualD12();
        expect(result.hopeDie).toBeGreaterThanOrEqual(1);
        expect(result.hopeDie).toBeLessThanOrEqual(12);
        expect(result.fearDie).toBeGreaterThanOrEqual(1);
        expect(result.fearDie).toBeLessThanOrEqual(12);
        expect(result.total).toBe(result.hopeDie + result.fearDie);
      }
    });
  });

  describe('resolveRoll', () => {
    it('returns criticalSuccess when dice match and total meets difficulty', () => {
      const result = resolveRoll(7, 7, 0, 15);
      expect(result.type).toBe('criticalSuccess');
      expect(result.success).toBe(true);
      expect(result.isCritical).toBe(true);
      expect(result.hopeGained).toBe(1);
      expect(result.fearGained).toBe(0);
    });

    it('returns criticalSuccess even when total < difficulty (auto-success)', () => {
      const result = resolveRoll(2, 2, 0, 30);
      expect(result.type).toBe('criticalSuccess');
      expect(result.success).toBe(true);
    });

    it('returns hopeSuccess when hope > fear and total >= difficulty', () => {
      const result = resolveRoll(10, 5, 2, 15);
      expect(result.type).toBe('hopeSuccess');
      expect(result.success).toBe(true);
      expect(result.hopeGained).toBe(1);
      expect(result.fearGained).toBe(0);
    });

    it('returns fearSuccess when fear > hope and total >= difficulty', () => {
      const result = resolveRoll(3, 8, 5, 15);
      expect(result.type).toBe('fearSuccess');
      expect(result.success).toBe(true);
      expect(result.hopeGained).toBe(0);
      expect(result.fearGained).toBe(1);
    });

    it('returns hopeFailure when hope > fear and total < difficulty', () => {
      const result = resolveRoll(8, 3, 0, 20);
      expect(result.type).toBe('hopeFailure');
      expect(result.success).toBe(false);
      expect(result.hopeGained).toBe(1);
      expect(result.fearGained).toBe(0);
    });

    it('returns fearFailure when fear > hope and total < difficulty', () => {
      const result = resolveRoll(2, 5, 0, 20);
      expect(result.type).toBe('fearFailure');
      expect(result.success).toBe(false);
      expect(result.hopeGained).toBe(0);
      expect(result.fearGained).toBe(1);
    });

    it('includes advantage/disadvantage info', () => {
      const result = resolveRoll(10, 5, 0, 15, 2, 1);
      expect(result.advantageDice).toBe(2);
      expect(result.disadvantageDice).toBe(1);
    });
  });

  describe('rollAdvantageDisadvantage', () => {
    it('returns same total when net advantage is 0', () => {
      const result = rollAdvantageDisadvantage(15, 1, 1);
      expect(result.netAdvantage).toBe(0);
      expect(result.d6Result).toBeNull();
      expect(result.finalTotal).toBe(15);
    });

    it('adds d6 when net advantage > 0', () => {
      const result = rollAdvantageDisadvantage(15, 2, 0);
      expect(result.netAdvantage).toBeGreaterThan(0);
      expect(result.d6Result).toBeGreaterThanOrEqual(1);
      expect(result.d6Result).toBeLessThanOrEqual(6);
      expect(result.finalTotal).toBeGreaterThanOrEqual(16);
      expect(result.finalTotal).toBeLessThanOrEqual(21);
    });

    it('subtracts d6 when net advantage < 0', () => {
      const result = rollAdvantageDisadvantage(15, 0, 2);
      expect(result.netAdvantage).toBeLessThan(0);
      expect(result.d6Result).toBeGreaterThanOrEqual(1);
      expect(result.d6Result).toBeLessThanOrEqual(6);
      expect(result.finalTotal).toBeGreaterThanOrEqual(9);
      expect(result.finalTotal).toBeLessThanOrEqual(14);
    });
  });

  describe('resolveReactionRoll', () => {
    it('auto-succeeds on critical', () => {
      const result = resolveReactionRoll(6, 6, 0, 30);
      expect(result.success).toBe(true);
      expect(result.isCritical).toBe(true);
    });

    it('does not generate hope or fear', () => {
      const result = resolveReactionRoll(10, 5, 0, 15);
      expect(result.hopeGained).toBe(0);
      expect(result.fearGained).toBe(0);
    });

    it('succeeds when total meets difficulty', () => {
      const result = resolveReactionRoll(10, 5, 3, 15);
      expect(result.success).toBe(true);
    });

    it('fails when total below difficulty', () => {
      const result = resolveReactionRoll(2, 3, 0, 20);
      expect(result.success).toBe(false);
    });
  });
});

// ===== 伤害系统 =====

describe('Damage System', () => {
  describe('calculateThresholds', () => {
    it('calculates all three thresholds', () => {
      const result = calculateThresholds(5, 11, 1);
      expect(result.minor).toBe(6);  // 5 + 1
      expect(result.major).toBe(12); // 11 + 1
      expect(result.severe).toBe(24); // 12 * 2
    });

    it('includes modifiers', () => {
      const result = calculateThresholds(5, 11, 1, 3);
      expect(result.minor).toBe(9);  // 5 + 1 + 3
      expect(result.major).toBe(15); // 11 + 1 + 3
      expect(result.severe).toBe(30); // 15 * 2
    });
  });

  describe('calculateDamageSeverity', () => {
    const minor = 6, major = 12, severe = 24;

    it('returns none for zero damage', () => {
      expect(calculateDamageSeverity(0, minor, major, severe)).toBe('none');
    });

    it('returns minor for low damage', () => {
      expect(calculateDamageSeverity(3, minor, major, severe)).toBe('minor');
      expect(calculateDamageSeverity(11, minor, major, severe)).toBe('minor');
    });

    it('returns major for moderate damage', () => {
      expect(calculateDamageSeverity(12, minor, major, severe)).toBe('major');
      expect(calculateDamageSeverity(23, minor, major, severe)).toBe('major');
    });

    it('returns severe for high damage', () => {
      expect(calculateDamageSeverity(24, minor, major, severe)).toBe('severe');
      expect(calculateDamageSeverity(50, minor, major, severe)).toBe('severe');
    });
  });

  describe('getHpLossFromSeverity', () => {
    it('returns correct values for each severity', () => {
      expect(getHpLossFromSeverity('none')).toBe(0);
      expect(getHpLossFromSeverity('minor')).toBe(1);
      expect(getHpLossFromSeverity('major')).toBe(2);
      expect(getHpLossFromSeverity('severe')).toBe(3);
    });
  });

  describe('applyArmorSlot', () => {
    it('reduces severity by one level per slot spent', () => {
      expect(applyArmorSlot('severe', 1).newSeverity).toBe('major');
      expect(applyArmorSlot('major', 1).newSeverity).toBe('minor');
      expect(applyArmorSlot('minor', 1).newSeverity).toBe('none');
    });

    it('can reduce multiple levels with multiple slots', () => {
      expect(applyArmorSlot('severe', 2).newSeverity).toBe('minor');
      expect(applyArmorSlot('severe', 3).newSeverity).toBe('none');
    });

    it('reports actual slots spent', () => {
      expect(applyArmorSlot('minor', 3).slotsSpent).toBe(1); // Can't go below none
      expect(applyArmorSlot('none', 1).slotsSpent).toBe(0);
    });
  });

  describe('calculateCriticalDamage', () => {
    it('adds max die value to normal damage', () => {
      const result = calculateCriticalDamage(2, 'd8', 3);
      expect(result.maxDieValue).toBe(8);
      expect(result.totalDamage).toBe(result.normalDamage + 8);
    });
  });

  describe('rollWeaponDamage', () => {
    it('returns correct number of rolls', () => {
      const result = rollWeaponDamage(3, 'd6', 2);
      expect(result.rolls).toHaveLength(3);
      for (const r of result.rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    });
  });
});

// ===== 希望点/恐惧点 =====

describe('Hope/Fear System', () => {
  describe('spendHope', () => {
    it('deducts hope points', () => {
      expect(spendHope(5, 3)).toBe(2);
    });

    it('returns null when insufficient hope', () => {
      expect(spendHope(2, 3)).toBeNull();
    });

    it('allows spending exact amount', () => {
      expect(spendHope(3, 3)).toBe(0);
    });
  });

  describe('gainHope', () => {
    it('adds hope points up to max', () => {
      expect(gainHope(3, 6, 2)).toBe(5);
    });

    it('caps at maxHope', () => {
      expect(gainHope(5, 6, 3)).toBe(6);
    });
  });

  describe('gainFearOnRest', () => {
    it('returns 1-4 for short rest', () => {
      for (let i = 0; i < 50; i++) {
        const fear = gainFearOnRest('short');
        expect(fear).toBeGreaterThanOrEqual(1);
        expect(fear).toBeLessThanOrEqual(4);
      }
    });

    it('returns 3-6 for long rest (1d4+2)', () => {
      for (let i = 0; i < 50; i++) {
        const fear = gainFearOnRest('long');
        expect(fear).toBeGreaterThanOrEqual(3);
        expect(fear).toBeLessThanOrEqual(6);
      }
    });
  });
});

// ===== 压力系统 =====

describe('Stress System', () => {
  describe('applyStressOverflow', () => {
    it('applies stress normally when not overflowing', () => {
      const result = applyStressOverflow(2, 6, 3);
      expect(result.newStress).toBe(5);
      expect(result.hpOverflow).toBe(0);
      expect(result.shouldApplyVulnerable).toBe(false);
    });

    it('overflows to HP when stress exceeds max', () => {
      const result = applyStressOverflow(5, 6, 3);
      expect(result.newStress).toBe(6);
      expect(result.hpOverflow).toBe(2);
      expect(result.shouldApplyVulnerable).toBe(true);
    });

    it('applies vulnerable when hitting max stress', () => {
      const result = applyStressOverflow(5, 6, 1);
      expect(result.newStress).toBe(6);
      expect(result.shouldApplyVulnerable).toBe(true);
    });
  });

  describe('shouldApplyVulnerableOnStress', () => {
    it('returns true when crossing max stress threshold', () => {
      expect(shouldApplyVulnerableOnStress(5, 6, 1)).toBe(true);
    });

    it('returns false when not reaching max', () => {
      expect(shouldApplyVulnerableOnStress(3, 6, 2)).toBe(false);
    });

    it('returns false when already at max', () => {
      expect(shouldApplyVulnerableOnStress(6, 6, 1)).toBe(false);
    });
  });

  describe('clearStress', () => {
    it('reduces stress by amount', () => {
      expect(clearStress(5, 3)).toBe(2);
    });

    it('does not go below 0', () => {
      expect(clearStress(2, 5)).toBe(0);
    });
  });
});

// ===== 休整系统 =====

describe('Rest System', () => {
  describe('getShortRestActions', () => {
    it('returns 4 actions', () => {
      expect(getShortRestActions()).toHaveLength(4);
    });
  });

  describe('getLongRestActions', () => {
    it('returns 5 actions', () => {
      expect(getLongRestActions()).toHaveLength(5);
    });
  });

  describe('canShortRest', () => {
    it('allows up to 3 short rests between long rests', () => {
      expect(canShortRest(0)).toBe(true);
      expect(canShortRest(1)).toBe(true);
      expect(canShortRest(2)).toBe(true);
      expect(canShortRest(3)).toBe(false);
    });
  });

  describe('executeRest', () => {
    const mockCharacter: Character = {
      id: 'test',
      name: 'Test',
      classId: 'warrior',
      subclassId: 'warrior-valor',
      ancestryId: 'human',
      communityId: 'high-city',
      level: 1,
      tier: 1,
      proficiency: 1,
      attributes: { agility: 2, strength: 1, finesse: 0, instinct: 0, presence: 0, knowledge: -1 },
      attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
      hp: 3,
      maxHp: 6,
      stress: 2,
      maxStress: 6,
      hope: 2,
      maxHope: 6,
      armorSlots: 2,
      maxArmorSlots: 4,
      evasion: 12,
      minorThreshold: 6,
      majorThreshold: 12,
      severeThreshold: 24,
      mainWeapon: { id: 'broadsword', name: '阔剑', nameEn: 'Broadsword', attribute: 'agility', distance: 'melee' as const, damageDie: 'd8' as const, damageModifier: 0, load: 'oneHanded' as const, traits: ['reliable'], weaponTier: 1 },
      armor: { id: 'chain-armor', name: '链甲', nameEn: 'Chain Armor', baseThreshold: 7, baseThresholdSevere: 15, armorSlots: 4, evasionPenalty: -1, traits: ['heavy'], armorTier: 1 },
      inventory: [],
      gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
      experiences: [],
      domainCardConfig: { loadout: [], vault: [], maxLoadout: 5 },
      scars: [],
      conditions: [],
      resistances: [],
      reactionsUsed: 0,
      backstory: '',
      personalQuest: '',
      relationships: [],
    };

    it('executes a short rest with treatWounds and prepare', () => {
      const result = executeRest('short', ['treatWounds', 'prepare'], mockCharacter, 0);
      expect(result.type).toBe('short');
      expect(result.hpRestored).toBeGreaterThanOrEqual(2); // 1d4 + tier 1
      expect(result.hopeGained).toBe(1);
      expect(result.fearGainedByGM).toBeGreaterThanOrEqual(1);
      expect(result.newShortRestCount).toBe(1);
    });

    it('executes a long rest with treatAllWounds and relieveAllStress', () => {
      const result = executeRest('long', ['treatAllWounds', 'relieveAllStress'], mockCharacter, 2);
      expect(result.hpRestored).toBe(3); // maxHp(6) - hp(3) = 3
      expect(result.stressCleared).toBe(2); // all stress
      expect(result.domainCardsSwapped).toBe(true);
      expect(result.newShortRestCount).toBe(0); // reset on long rest
    });
  });
});

// ===== 死亡行动 =====

describe('Death Moves', () => {
  describe('gloriousSacrifice', () => {
    it('results in character death', () => {
      const result = gloriousSacrifice();
      expect(result.type).toBe('gloriousSacrifice');
      expect(result.characterDied).toBe(true);
    });
  });

  describe('avoidDeath', () => {
    it('grants scar when hope die <= level', () => {
      const result = avoidDeath(3, 2); // level 3, hope die 2
      expect(result.scarGained).toBe(true);
      expect(result.hpRestored).toBe(1);
    });

    it('does not grant scar when hope die > level', () => {
      const result = avoidDeath(2, 5); // level 2, hope die 5
      expect(result.scarGained).toBe(false);
      expect(result.hpRestored).toBe(1);
    });
  });

  describe('desperateGamble', () => {
    it('full recovery on critical (equal dice)', () => {
      const result = desperateGamble(7, 7);
      expect(result.characterDied).toBe(false);
      expect(result.hpRestored).toBe(999); // full
      expect(result.stressCleared).toBe(999); // full
    });

    it('partial recovery when hope > fear', () => {
      const result = desperateGamble(8, 3);
      expect(result.characterDied).toBe(false);
      expect(result.hpRestored).toBe(8);
      expect(result.stressCleared).toBe(8);
    });

    it('death when fear > hope', () => {
      const result = desperateGamble(3, 8);
      expect(result.characterDied).toBe(true);
    });
  });
});

// ===== 升级系统 =====

describe('Level Up System', () => {
  describe('getLevelUpOptions', () => {
    it('includes base options for all levels', () => {
      const options = getLevelUpOptions(1);
      expect(options.length).toBeGreaterThanOrEqual(6);
      const types = options.map((o: { type: string }) => o.type);
      expect(types).toContain('domainCard');
      expect(types).toContain('attributeBoost');
    });

    it('includes proficiency at level 2+', () => {
      const options = getLevelUpOptions(2);
      const types = options.map((o: { type: string }) => o.type);
      expect(types).toContain('proficiency');
    });
  });

  describe('getTierUpBenefits', () => {
    it('grants benefits at level 2 (tier 2)', () => {
      const benefits = getTierUpBenefits(2);
      const types = benefits.filter((b: { mandatory?: boolean }) => b.mandatory).map((b: { type: string }) => b.type);
      expect(types).toContain('experience');
      expect(types).toContain('proficiency');
    });

    it('grants additional attribute boost at level 5', () => {
      const benefits = getTierUpBenefits(5);
      const types = benefits.filter((b: { mandatory?: boolean }) => b.mandatory).map((b: { type: string }) => b.type);
      expect(types).toContain('attributeBoost');
    });

    it('no benefits at non-tier-up levels', () => {
      expect(getTierUpBenefits(3)).toHaveLength(0);
      expect(getTierUpBenefits(6)).toHaveLength(0);
    });
  });
});

// ===== 抗性/免疫 =====

describe('Resistance/Immunity', () => {
  const resistances: Resistance[] = [
    { damageType: 'physical', mode: 'resistance' },
    { damageType: 'magical', mode: 'immunity' },
  ];

  it('halves damage with resistance', () => {
    const result = applyResistance(10, 'physical', resistances);
    expect(result.finalDamage).toBe(5);
    expect(result.resisted).toBe(true);
    expect(result.immune).toBe(false);
  });

  it('nullifies damage with immunity', () => {
    const result = applyResistance(10, 'magical', resistances);
    expect(result.finalDamage).toBe(0);
    expect(result.resisted).toBe(false);
    expect(result.immune).toBe(true);
  });

  it('does not affect non-matching damage types', () => {
    const result = applyResistance(10, 'direct', resistances);
    expect(result.finalDamage).toBe(10);
    expect(result.resisted).toBe(false);
    expect(result.immune).toBe(false);
  });
});

// ===== 状态管理 =====

describe('Condition Management', () => {
  const condition: ConditionInstance = {
    condition: 'vulnerable',
    duration: 'temporary',
    source: 'attack',
    roundsRemaining: 3,
  };

  it('adds a new condition', () => {
    const result = addCondition([], condition);
    expect(result).toHaveLength(1);
    expect(result[0].condition).toBe('vulnerable');
  });

  it('does not duplicate existing condition', () => {
    const existing: ConditionInstance[] = [{ ...condition }];
    const result = addCondition(existing, condition);
    expect(result).toHaveLength(1);
  });

  it('removes a condition by name', () => {
    const conditions: ConditionInstance[] = [condition];
    const result = removeCondition(conditions, 'vulnerable');
    expect(result).toHaveLength(0);
  });

  it('ticks temporary conditions and reports expired', () => {
    const conditions: ConditionInstance[] = [
      { condition: 'vulnerable', duration: 'temporary', source: 'attack', roundsRemaining: 1 },
      { condition: 'restrained', duration: 'temporary', source: 'spell', roundsRemaining: 3 },
    ];
    const { updated, expired } = tickConditions(conditions);
    expect(expired).toContain('vulnerable');
    expect(updated).toHaveLength(1);
    expect(updated[0].roundsRemaining).toBe(2);
  });

  it('checks for condition presence', () => {
    expect(hasCondition([condition], 'vulnerable')).toBe(true);
    expect(hasCondition([condition], 'hidden')).toBe(false);
  });
});

// ===== 领域卡系统 =====

describe('Domain Card System', () => {
  const loadoutCard: DomainCard = {
    id: 'card-1', name: '测试卡1', nameEn: 'Test Card 1',
    domain: 'arcane', level: 1, type: 'spell', recallCost: 1,
    description: '测试', effect: '测试',
  };
  const vaultCard: DomainCard = {
    id: 'card-2', name: '测试卡2', nameEn: 'Test Card 2',
    domain: 'arcane', level: 2, type: 'spell', recallCost: 2,
    description: '测试', effect: '测试',
  };

  describe('recallDomainCard', () => {
    it('recalls a card from vault to loadout', () => {
      const result = recallDomainCard('card-2', [loadoutCard], [vaultCard], 3);
      expect(result).not.toBeNull();
      expect(result!.newLoadout).toHaveLength(2);
      expect(result!.newVault).toHaveLength(0);
      expect(result!.costPaid).toBe(2);
    });

    it('fails when recall cost too high', () => {
      const result = recallDomainCard('card-2', [loadoutCard], [vaultCard], 1);
      expect(result).toBeNull();
    });

    it('fails when loadout is full (5 cards)', () => {
      const fullLoadout: DomainCard[] = Array.from({ length: 5 }, (_, i) => ({
        ...loadoutCard, id: `card-${i}`, name: `卡${i}`,
      }));
      const result = recallDomainCard('card-2', fullLoadout, [vaultCard], 5);
      expect(result).toBeNull();
    });
  });

  describe('swapDomainCard', () => {
    it('swaps a loadout card with a vault card', () => {
      const result = swapDomainCard('card-1', 'card-2', [loadoutCard], [vaultCard]);
      expect(result).not.toBeNull();
      expect(result!.newLoadout[0].id).toBe('card-2');
      expect(result!.newVault[0].id).toBe('card-1');
    });

    it('returns null for non-existent cards', () => {
      const result = swapDomainCard('nonexistent', 'card-2', [loadoutCard], [vaultCard]);
      expect(result).toBeNull();
    });
  });
});

// ===== 倒计时系统 =====

describe('Countdown System', () => {
  const countdown: Countdown = {
    id: 'cd-1',
    name: '迷雾侵蚀',
    description: '迷雾逐渐侵蚀',
    currentValue: 3,
    maxValue: 4,
    decrementOn: 'playerAction',
    triggerAt: 0,
    triggered: false,
    triggerEffect: '迷雾爆发',
  };

  it('decrements countdown value', () => {
    const result = tickCountdown(countdown);
    expect(result.currentValue).toBe(2);
    expect(result.triggered).toBe(false);
  });

  it('triggers when reaching trigger value', () => {
    const nearEnd: Countdown = { ...countdown, currentValue: 1 };
    const result = tickCountdown(nearEnd);
    expect(result.currentValue).toBe(0);
    expect(result.triggered).toBe(true);
  });

  it('does not tick already triggered countdown', () => {
    const triggered: Countdown = { ...countdown, triggered: true };
    const result = tickCountdown(triggered);
    expect(result.currentValue).toBe(triggered.currentValue);
  });

  it('batch ticks countdowns by trigger type', () => {
    const cd1: Countdown = { ...countdown, id: 'cd-1', currentValue: 2 };
    const cd2: Countdown = { ...countdown, id: 'cd-2', decrementOn: 'round', currentValue: 3 };
    const { updated, triggered } = tickCountdowns([cd1, cd2], 'playerAction');
    expect(updated[0].currentValue).toBe(1); // cd-1 was decremented
    expect(updated[1].currentValue).toBe(3); // cd-2 was not (different trigger)
    expect(triggered).toHaveLength(0);
  });
});

// ===== 角色卡验证 =====

describe('Character Validation', () => {
  it('validates correct character sheet', () => {
    const errors = validateCharacterSheet({
      hp: 5, maxHp: 6,
      hope: 3, maxHope: 6,
      attributes: { agility: 2, strength: 1, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
      experiences: [
        { id: '1', name: '战士', modifier: 2 },
        { id: '2', name: '冒险者', modifier: 2 },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('catches HP exceeding max', () => {
    const errors = validateCharacterSheet({ hp: 10, maxHp: 6 });
    expect(errors).toContain('HP不能超过maxHp');
  });

  it('catches hope exceeding maxHope', () => {
    const errors = validateCharacterSheet({ hope: 7, maxHope: 6 });
    expect(errors).toContain('希望点不能超过maxHope');
  });

  it('catches incorrect attribute distribution', () => {
    const errors = validateCharacterSheet({
      attributes: { agility: 3, strength: 1, finesse: 0, instinct: 0, presence: 0, knowledge: -1 },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('catches insufficient experiences', () => {
    const errors = validateCharacterSheet({
      experiences: [{ id: '1', name: '战士', modifier: 2 }],
    });
    expect(errors.some((e: string) => e.includes('至少需要2个经历'))).toBe(true);
  });

  it('catches domain card loadout exceeding 5', () => {
    const errors = validateCharacterSheet({
      domainCardConfig: {
        loadout: Array.from({ length: 6 }, (_, i) => ({
          id: `c${i}`, name: `卡${i}`, nameEn: `Card ${i}`,
          domain: 'arcane' as const, level: 1, type: 'spell' as const, recallCost: 0,
          description: '', effect: '',
        })),
        vault: [],
        maxLoadout: 5,
      },
    });
    expect(errors.some((e: string) => e.includes('不能超过5张'))).toBe(true);
  });
});

// ===== 德拉肯海姆机制 =====

describe('Drakkenheim Mechanics', () => {
  describe('Contamination', () => {
    it('validates contamination levels', () => {
      expect(validateContaminationLevel(0)).toBe(true);
      expect(validateContaminationLevel(3)).toBe(true);
      expect(validateContaminationLevel(6)).toBe(true);
      expect(validateContaminationLevel(-1)).toBe(false);
      expect(validateContaminationLevel(7)).toBe(false);
    });

    it('detects terminal contamination', () => {
      expect(isContaminationTerminal(6)).toBe(true);
      expect(isContaminationTerminal(5)).toBe(false);
    });

    it('detects mutation card triggers', () => {
      expect(shouldDrawMutationCard(3, 2)).toBe(true);
      expect(shouldDrawMutationCard(5, 4)).toBe(true);
      expect(shouldDrawMutationCard(2, 1)).toBe(false);
      expect(shouldDrawMutationCard(4, 3)).toBe(false);
    });
  });

  describe('Exploration Timer', () => {
    it('returns correct timers for each zone', () => {
      expect(getExplorationTimer('village')).toBe(Infinity);
      expect(getExplorationTimer('outer')).toBe(4);
      expect(getExplorationTimer('inner')).toBe(3);
      expect(getExplorationTimer('heavy')).toBe(2);
    });
  });

  describe('Haze Reaction Difficulty', () => {
    it('returns correct difficulties', () => {
      expect(getHazeReactionDifficulty('village')).toBe(0);
      expect(getHazeReactionDifficulty('outer')).toBe(12);
      expect(getHazeReactionDifficulty('inner')).toBe(14);
      expect(getHazeReactionDifficulty('heavy')).toBe(16);
    });
  });

  describe('Contamination Risk', () => {
    it('returns correct risks per zone', () => {
      expect(getContaminationRisk('village')).toBe(0);
      expect(getContaminationRisk('outer')).toBe(1);
      expect(getContaminationRisk('inner')).toBe(2);
      expect(getContaminationRisk('heavy')).toBe(3);
    });

    it('returns correct delerium risks', () => {
      expect(getDeleriumContaminationRisk('fragment')).toBe(1);
      expect(getDeleriumContaminationRisk('shard')).toBe(2);
      expect(getDeleriumContaminationRisk('crystal')).toBe(3);
      expect(getDeleriumContaminationRisk('vein')).toBe(4);
    });
  });

  describe('Faction Relations', () => {
    it('returns correct labels', () => {
      expect(getFactionRelationLabel(1)).toBe('敌对');
      expect(getFactionRelationLabel(3)).toBe('不友好');
      expect(getFactionRelationLabel(5)).toBe('中立');
      expect(getFactionRelationLabel(7)).toBe('友好');
      expect(getFactionRelationLabel(9)).toBe('同盟');
    });

    it('clamps relation to 1-10 range', () => {
      expect(changeFactionRelation(5, -10)).toBe(1);
      expect(changeFactionRelation(5, 10)).toBe(10);
      expect(changeFactionRelation(5, 2)).toBe(7);
    });
  });
});

// ===== 辅助工具 =====

describe('Utility Functions', () => {
  describe('calculateEvasion', () => {
    it('calculates evasion correctly', () => {
      expect(calculateEvasion(10, 2, 1)).toBe(11); // 10 + 2 - 1
    });

    it('handles zero penalty', () => {
      expect(calculateEvasion(12, 1, 0)).toBe(13);
    });
  });

  describe('rollDie / rollDice', () => {
    it('produces values within range', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollDie(6)).toBeGreaterThanOrEqual(1);
        expect(rollDie(6)).toBeLessThanOrEqual(6);
      }
    });

    it('rollDice returns correct count', () => {
      expect(rollDice(3, 8)).toHaveLength(3);
    });
  });

  describe('rollDamageString', () => {
    it('parses and rolls damage strings', () => {
      for (let i = 0; i < 20; i++) {
        const result = rollDamageString('2d8+3');
        expect(result).toBeGreaterThanOrEqual(5);  // 2*1 + 3
        expect(result).toBeLessThanOrEqual(19); // 2*8 + 3
      }
    });

    it('handles simple dice without modifier', () => {
      for (let i = 0; i < 20; i++) {
        const result = rollDamageString('1d6');
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(6);
      }
    });

    it('returns 0 for invalid strings', () => {
      expect(rollDamageString('invalid')).toBe(0);
    });
  });

  describe('attributeToModifier', () => {
    it('maps attribute values to modifiers', () => {
      expect(attributeToModifier(3)).toBe(-2);
      expect(attributeToModifier(7)).toBe(-1);
      expect(attributeToModifier(10)).toBe(0);
      expect(attributeToModifier(14)).toBe(1);
      expect(attributeToModifier(18)).toBe(2);
      expect(attributeToModifier(22)).toBe(3);
    });
  });

  // ===== 骰子结算（任务 1.2） =====

  describe('resolveDualityDice — 服务端结算入口', () => {
    it('希望成功：hopeDie>fearDie, total>=difficulty → hopeGain=1, fearGain=0', () => {
      const result = resolveDualityDice(10, 5, 0, 12);
      expect(result.outcome).toBe('hopeSuccess');
      expect(result.withHope).toBe(true);
      expect(result.withFear).toBe(false);
      expect(result.hopeGain).toBe(1);
      expect(result.fearGain).toBe(0);
      expect(result.success).toBe(true);
      expect(result.isCritical).toBe(false);
      expect(result.total).toBe(15);
    });

    it('恐惧成功：fearDie>hopeDie, total>=difficulty → hopeGain=0, fearGain=1', () => {
      const result = resolveDualityDice(3, 10, 0, 12);
      expect(result.outcome).toBe('fearSuccess');
      expect(result.withHope).toBe(false);
      expect(result.withFear).toBe(true);
      expect(result.hopeGain).toBe(0);
      expect(result.fearGain).toBe(1);
      expect(result.success).toBe(true);
      expect(result.total).toBe(13);
    });

    it('希望失败：hopeDie>fearDie, total<difficulty → hopeGain=1, fearGain=0', () => {
      const result = resolveDualityDice(5, 3, 0, 12);
      expect(result.outcome).toBe('hopeFailure');
      expect(result.withHope).toBe(true);
      expect(result.hopeGain).toBe(1);
      expect(result.fearGain).toBe(0);
      expect(result.success).toBe(false);
    });

    it('恐惧失败：fearDie>hopeDie, total<difficulty → hopeGain=0, fearGain=1', () => {
      const result = resolveDualityDice(2, 5, 0, 12);
      expect(result.outcome).toBe('fearFailure');
      expect(result.withHope).toBe(false);
      expect(result.withFear).toBe(true);
      expect(result.hopeGain).toBe(0);
      expect(result.fearGain).toBe(1);
      expect(result.success).toBe(false);
    });

    it('暴击：hopeDie===fearDie → criticalSuccess, hopeGain=1, fearGain=0, auto-success', () => {
      const result = resolveDualityDice(3, 3, 0, 12);
      expect(result.outcome).toBe('criticalSuccess');
      expect(result.isCritical).toBe(true);
      expect(result.hopeGain).toBe(1);
      expect(result.fearGain).toBe(0);
      expect(result.success).toBe(true);
      expect(result.total).toBe(6);
    });

    it('刚好达到难度：total === difficulty → success', () => {
      const result = resolveDualityDice(7, 5, 0, 12);
      expect(result.outcome).toBe('hopeSuccess');
      expect(result.success).toBe(true);
      expect(result.total).toBe(12);
    });

    it('带 modifier 的判定', () => {
      const result = resolveDualityDice(5, 3, 5, 12);
      expect(result.outcome).toBe('hopeSuccess');
      expect(result.total).toBe(13);
      expect(result.success).toBe(true);
    });
  });
});
