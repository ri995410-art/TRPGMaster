import { selectEnemyActions } from '../../rules/systems/enemyBehavior';
import type { BehaviorContext } from '../../rules/systems/enemyBehavior';
import type { CombatEnemy, Character, EnemyAttack, EnemyFeature } from '@trpgmaster/shared';

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

function makeAttack(overrides: Partial<EnemyAttack> = {}): EnemyAttack {
  return {
    name: 'Slash',
    attribute: 'strength',
    distance: 'melee',
    damage: { dice: [{ count: 1, sides: 8 }], modifier: 0, type: 'physical' },
    ...overrides,
  };
}

function makeFeature(overrides: Partial<EnemyFeature> = {}): EnemyFeature {
  return {
    name: 'Fear Strike',
    type: 'fear',
    cost: 1,
    description: 'A terrifying attack',
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<CombatEnemy> = {}): CombatEnemy {
  return {
    id: 'enemy-1', statBlockId: 'goblin', name: 'Goblin',
    currentHp: 10, maxHp: 10, currentStress: 0, maxStress: 3,
    conditions: [], isFocused: false, hasActed: false,
    evasion: 10, behavior: 'bruiser',
    attacks: [makeAttack()],
    features: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<BehaviorContext> = {}): BehaviorContext {
  return {
    enemy: makeEnemy(),
    players: [makeCharacter()],
    allEnemies: [makeEnemy()],
    fearPoints: 0,
    round: 1,
    ...overrides,
  };
}

describe('enemyBehavior', () => {
  describe('bruiser', () => {
    it('selects highest-damage attack', () => {
      const enemy = makeEnemy({
        behavior: 'bruiser',
        attacks: [
          makeAttack({ name: 'Weak Hit', damage: { dice: [{ count: 1, sides: 4 }], modifier: 0, type: 'physical' } }),
          makeAttack({ name: 'Power Hit', damage: { dice: [{ count: 2, sides: 8 }], modifier: 2, type: 'physical' } }),
        ],
      });
      const ctx = makeContext({ enemy });
      const result = selectEnemyActions(ctx);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].kind).toBe('attack');
      // Should select the power hit (higher average damage)
      expect(result.actions[0].attackIndex).toBe(1);
    });
  });

  describe('leader', () => {
    it('prefers fear traits that buff allies, then attacks', () => {
      const enemy = makeEnemy({
        behavior: 'leader',
        attacks: [makeAttack()],
        features: [makeFeature({ type: 'fear', cost: 1, name: 'Command', description: '指挥盟友增益攻击' })],
      });
      const ctx = makeContext({ enemy, fearPoints: 2 });
      const result = selectEnemyActions(ctx);
      // Should have at least a fear action and an attack
      expect(result.actions.some(a => a.kind === 'useFearTrait')).toBe(true);
      expect(result.actions.some(a => a.kind === 'attack')).toBe(true);
    });
  });

  describe('support', () => {
    it('prefers action features over attacks', () => {
      const enemy = makeEnemy({
        behavior: 'support',
        attacks: [makeAttack()],
        features: [makeFeature({ type: 'action', cost: 0, name: 'Heal Ally', description: '治疗恢复盟友生命' })],
      });
      const ctx = makeContext({ enemy });
      const result = selectEnemyActions(ctx);
      // Support should try action feature first
      expect(result.actions.some(a => a.kind === 'useActionFeature')).toBe(true);
      expect(result.actions.some(a => a.kind === 'attack')).toBe(true);
    });
  });

  describe('solo', () => {
    it('uses multiple attacks in one turn', () => {
      const enemy = makeEnemy({
        behavior: 'solo',
        attacks: [makeAttack({ name: 'Claw' }), makeAttack({ name: 'Tail' })],
      });
      const ctx = makeContext({ enemy });
      const result = selectEnemyActions(ctx);
      expect(result.actions.filter(a => a.kind === 'attack').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ambusher', () => {
    it('targets vulnerable players', () => {
      const vulnerablePlayer = makeCharacter({
        id: 'vuln-1',
        conditions: [{ condition: 'vulnerable', source: 'test', duration: 'temporary' }],
      });
      const normalPlayer = makeCharacter({ id: 'normal-1' });
      const enemy = makeEnemy({ behavior: 'ambusher' });
      const ctx = makeContext({ enemy, players: [normalPlayer, vulnerablePlayer] });
      const result = selectEnemyActions(ctx);
      // Ambusher should target the vulnerable player
      if (result.actions.length > 0) {
        expect(result.actions[0].targetId).toBe('vuln-1');
      }
    });
  });

  describe('caster', () => {
    it('prefers ranged/AoE attacks', () => {
      const enemy = makeEnemy({
        behavior: 'caster',
        attacks: [
          makeAttack({ name: 'Melee', distance: 'melee', targets: 'single' }),
          makeAttack({ name: 'Fireball', distance: 'far', targets: 'closeBlast' }),
        ],
      });
      const ctx = makeContext({ enemy });
      const result = selectEnemyActions(ctx);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].attackIndex).toBe(1); // Fireball
    });
  });

  describe('no available targets', () => {
    it('returns empty actions when all players are dead', () => {
      const enemy = makeEnemy();
      const ctx = makeContext({ enemy, players: [makeCharacter({ hp: 0 })] });
      const result = selectEnemyActions(ctx);
      expect(result.actions).toHaveLength(0);
    });
  });

  describe('stress management', () => {
    it('enemy with full stress still selects actions', () => {
      const enemy = makeEnemy({ currentStress: 3, maxStress: 3 });
      const ctx = makeContext({ enemy });
      const result = selectEnemyActions(ctx);
      // Even at full stress, the enemy can still act
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
    });
  });
});
