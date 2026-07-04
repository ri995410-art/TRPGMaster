import { resolvePlayerAttack, resolveDamageToCharacter, resolveEnemyAttack } from '../../rules/combatResolver';
import type { Character, CombatEnemy, ActionDeclaration } from '@trpgmaster/shared';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1', name: 'TestChar', classId: 'warrior', subclassId: '',
    ancestryId: 'human', communityId: 'village',
    level: 1, tier: 1, proficiency: 1,
    attributes: { agility: 1, strength: 2, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
    attributeMarks: { agility: false, strength: false, finesse: false, instinct: false, presence: false, knowledge: false },
    hp: 10, maxHp: 10, stress: 0, maxStress: 3, hope: 2, maxHope: 6,
    armorSlots: 2, maxArmorSlots: 3, evasion: 10,
    minorThreshold: 6, majorThreshold: 12, severeThreshold: 24,
    mainWeapon: { id: 'longsword', name: 'Longsword', nameEn: 'Longsword', attribute: 'agility', distance: 'melee', damageDie: 'd8', damageModifier: 0, load: 'oneHanded', traits: [], weaponTier: 1 },
    armor: { id: 'leather', name: 'Leather', nameEn: 'Leather', baseThreshold: 6, baseThresholdSevere: 13, armorSlots: 3, evasionPenalty: 0, traits: [], armorTier: 1 },
    inventory: [], gold: { coins: 0, handfuls: 0, bags: 0, chests: 0 },
    experiences: [], domainCardConfig: { loadout: [], vault: [], maxLoadout: 5 },
    featureUses: {}, scars: [], conditions: [], resistances: [], reactionsUsed: 0,
    backstory: '', personalQuest: '', relationships: [], adventureSummaries: [],
    ...overrides,
  } as Character;
}

function makeEnemy(overrides: Partial<CombatEnemy> = {}): CombatEnemy {
  return {
    id: 'enemy-1', statBlockId: 'goblin', name: 'Goblin',
    currentHp: 10, maxHp: 10, currentStress: 0, maxStress: 3,
    conditions: [], isFocused: false, hasActed: false,
    evasion: 10, behavior: 'bruiser', attacks: [], features: [],
    type: 'elite', majorThreshold: 8, severeThreshold: 15,
    ...overrides,
  };
}

describe('combatResolver', () => {
  describe('resolvePlayerAttack — threshold system', () => {
    it('minor damage: damageRolled < majorThreshold → hpLossToTarget=1', () => {
      const attacker = makeCharacter();
      const enemy = makeEnemy({ maxHp: 10, currentHp: 10, majorThreshold: 8, severeThreshold: 15 });
      // Force a hit with damageRolled=5 (< 8 majorThreshold)
      // proficiency=1, d8 weapon → damage = 1d8+0, min 1, max 8
      // Use critical hit to control damage: critical = maxDie + normalRoll
      // Actually we can't control damageRolled directly. Let's use a normal hit.
      // hopeDie=10, fearDie=5, difficulty=10, strength=2 → total=12 ≥ 10 → hit
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 10, hopeDie: 10, fearDie: 5,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(true);
      // Damage is rolled from 1d8 weapon with proficiency 1 → 1d8
      // If damageRolled < 8, it should be minor
      if (result.damageRolled < 8) {
        expect(result.severity).toBe('minor');
        expect(result.hpLossToTarget).toBe(1);
      }
    });

    it('major damage: majorThreshold ≤ damageRolled < severeThreshold → hpLossToTarget=2', () => {
      const attacker = makeCharacter({
        proficiency: 3, // 3d8 weapon damage
        mainWeapon: {
          id: 'greatsword', name: 'Greatsword', nameEn: 'Greatsword',
          attribute: 'strength', distance: 'melee', damageDie: 'd10', damageModifier: 6,
          load: 'twoHanded', traits: [], weaponTier: 2,
        },
      });
      const enemy = makeEnemy({ maxHp: 10, currentHp: 10, majorThreshold: 8, severeThreshold: 15 });
      // With 3d10+6, damage will be 9-36, likely ≥ 8 (major)
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(true);
      expect(result.damageRolled).toBeGreaterThanOrEqual(9); // 3*1+6=9
      if (result.damageRolled >= 8 && result.damageRolled < 15) {
        expect(result.severity).toBe('major');
        expect(result.hpLossToTarget).toBe(2);
      }
    });

    it('severe damage: damageRolled ≥ severeThreshold → hpLossToTarget=3', () => {
      const attacker = makeCharacter({
        proficiency: 4, // 4d10+6
        mainWeapon: {
          id: 'greatsword', name: 'Greatsword', nameEn: 'Greatsword',
          attribute: 'strength', distance: 'melee', damageDie: 'd10', damageModifier: 6,
          load: 'twoHanded', traits: [], weaponTier: 3,
        },
      });
      const enemy = makeEnemy({ maxHp: 10, currentHp: 10, majorThreshold: 8, severeThreshold: 15 });
      // With 4d10+6, damage will be 10-46, likely ≥ 15 (severe)
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(true);
      expect(result.damageRolled).toBeGreaterThanOrEqual(10); // 4*1+6=10
      if (result.damageRolled >= 15) {
        expect(result.severity).toBe('severe');
        expect(result.hpLossToTarget).toBe(3);
      }
    });

    it('miss results in zero hpLoss and severity none', () => {
      const attacker = makeCharacter();
      const enemy = makeEnemy();
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 30, hopeDie: 1, fearDie: 12,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(false);
      expect(result.hpLossToTarget).toBe(0);
      expect(result.damageRolled).toBe(0);
      expect(result.severity).toBe('none');
    });

    it('critical hit deals extra damage', () => {
      const attacker = makeCharacter();
      const enemy = makeEnemy({ maxHp: 50, currentHp: 50 });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 15, hopeDie: 6, fearDie: 6,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(true);
      expect(result.isCritical).toBe(true);
      expect(result.damageRolled).toBeGreaterThan(0);
    });

    it('minion: any hit defeats it (hpLossToTarget = maxHp)', () => {
      const attacker = makeCharacter();
      const minion = makeEnemy({
        type: 'minion', maxHp: 3, currentHp: 3,
        majorThreshold: undefined, severeThreshold: undefined,
        minionDefeatThreshold: 3,
      });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, minion, decl);
      expect(result.success).toBe(true);
      expect(result.hpLossToTarget).toBe(3); // maxHp=3, ensures defeat
      expect(result.severity).toBe('minor');
    });

    it('minion: extra defeated when damage exceeds threshold', () => {
      const attacker = makeCharacter({
        proficiency: 3,
        mainWeapon: {
          id: 'greatsword', name: 'Greatsword', nameEn: 'Greatsword',
          attribute: 'strength', distance: 'melee', damageDie: 'd10', damageModifier: 6,
          load: 'twoHanded', traits: [], weaponTier: 2,
        },
      });
      const minion = makeEnemy({
        type: 'minion', maxHp: 3, currentHp: 3,
        majorThreshold: undefined, severeThreshold: undefined,
        minionDefeatThreshold: 3,
      });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, minion, decl);
      expect(result.success).toBe(true);
      expect(result.hpLossToTarget).toBe(3); // maxHp
      // With 3d10+6, damage likely 9-36. If ≥ 6 (2*3), extraDefeated ≥ 1
      if (result.damageRolled >= 6) {
        expect(result.minionsExtraDefeated).toBeGreaterThanOrEqual(1);
      }
    });

    it('minion: no extra defeated when damage is low', () => {
      const attacker = makeCharacter(); // proficiency=1, d8 weapon
      const minion = makeEnemy({
        type: 'minion', maxHp: 3, currentHp: 3,
        majorThreshold: undefined, severeThreshold: undefined,
        minionDefeatThreshold: 5, // high threshold
      });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, minion, decl);
      expect(result.success).toBe(true);
      // With 1d8 and minionDefeatThreshold=5, need damage≥10 for extra
      // 1d8 max=8, so no extra
      expect(result.minionsExtraDefeated).toBeUndefined();
    });

    it('fallback: enemy without thresholds uses maxHp-based estimation', () => {
      const attacker = makeCharacter();
      const enemy = makeEnemy({
        maxHp: 10, currentHp: 10,
        majorThreshold: undefined, severeThreshold: undefined,
      });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.success).toBe(true);
      // hpLossToTarget should be 1, 2, or 3 (never raw damage)
      expect(result.hpLossToTarget).toBeGreaterThanOrEqual(1);
      expect(result.hpLossToTarget).toBeLessThanOrEqual(3);
    });

    it('narrationHint includes severity for non-minion', () => {
      const attacker = makeCharacter();
      const enemy = makeEnemy({ name: '强盗', majorThreshold: 8, severeThreshold: 14 });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, enemy, decl);
      expect(result.narrationHint).toContain('强盗');
      expect(result.narrationHint).toContain('点伤害');
    });

    it('narrationHint includes minion defeated for minion', () => {
      const attacker = makeCharacter();
      const minion = makeEnemy({
        name: '哥布林', type: 'minion', maxHp: 3, currentHp: 3,
        majorThreshold: undefined, severeThreshold: undefined,
      });
      const decl: ActionDeclaration = {
        kind: 'attack', attackerId: 'char-1', targetId: 'enemy-1',
        trait: 'strength', difficulty: 5, hopeDie: 10, fearDie: 3,
      };
      const result = resolvePlayerAttack(attacker, minion, decl);
      expect(result.narrationHint).toContain('杂兵被击败');
    });
  });

  describe('resolveDamageToCharacter', () => {
    it('minor damage = 1 HP mark', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24 });
      const result = resolveDamageToCharacter(target, 7, 0);
      expect(result.severityAfterArmor).toBe('minor');
      expect(result.hpLoss).toBe(1);
    });

    it('major damage = 2 HP marks', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24 });
      const result = resolveDamageToCharacter(target, 15, 0);
      expect(result.severityAfterArmor).toBe('major');
      expect(result.hpLoss).toBe(2);
    });

    it('severe damage = 3 HP marks', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24 });
      const result = resolveDamageToCharacter(target, 30, 0);
      expect(result.severityAfterArmor).toBe('severe');
      expect(result.hpLoss).toBe(3);
    });

    it('armor slot reduces severity by one tier', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24, armorSlots: 2 });
      const result = resolveDamageToCharacter(target, 15, 1);
      expect(result.severityAfterArmor).toBe('minor');
      expect(result.armorSlotsSpent).toBe(1);
      expect(result.hpLoss).toBe(1);
    });
  });

  describe('resolveEnemyAttack', () => {
    it('calculates severity against player thresholds', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24, armorSlots: 0 });
      const result = resolveEnemyAttack(
        { id: 'e1', name: 'Orc' }, target, 15,
        { d20Override: 20 }, // Force hit (20 >= any evasion)
      );
      expect(result.severity).toBe('major');
      expect(result.hpLoss).toBe(2);
    });

    it('auto-spends armor for major/severe damage', () => {
      const target = makeCharacter({ minorThreshold: 6, majorThreshold: 12, severeThreshold: 24, armorSlots: 2 });
      const result = resolveEnemyAttack(
        { id: 'e1', name: 'Orc' }, target, 15,
        { d20Override: 20 }, // Force hit
      );
      expect(result.severity).toBe('minor');
      expect(result.armorSlotsSpent).toBe(1);
      expect(result.hpLoss).toBe(1);
    });
  });
});
