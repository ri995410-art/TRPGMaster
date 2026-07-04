import { resolveFearAction, getAvailableFearActions } from '../../rules/systems/fearActions';
import type { FearAction, FearActionResult } from '../../rules/systems/fearActions';
import type { CombatEnemy } from '@trpgmaster/shared';

function makeEnemy(overrides: Partial<CombatEnemy> = {}): CombatEnemy {
  return {
    id: 'enemy-1', statBlockId: 'goblin', name: 'Goblin',
    currentHp: 10, maxHp: 10, currentStress: 0, maxStress: 3,
    conditions: [], isFocused: false, hasActed: false,
    evasion: 10, behavior: 'bruiser', attacks: [], features: [],
    ...overrides,
  };
}

describe('fearActions', () => {
  describe('resolveFearAction', () => {
    it('interruptAction — 1 Fear consumed, returns correct effect', () => {
      const action: FearAction = { type: 'interruptAction', cost: 1 };
      const result = resolveFearAction(action, 3);
      expect(result.success).toBe(true);
      expect(result.fearSpent).toBe(1);
      expect(result.remainingFear).toBe(2);
      expect(result.mechanicalEffect?.type).toBe('interruptAction');
      expect(result.errors).toHaveLength(0);
    });

    it('extraGMAction — 1 Fear consumed', () => {
      const action: FearAction = { type: 'extraGMAction', cost: 1 };
      const result = resolveFearAction(action, 2);
      expect(result.success).toBe(true);
      expect(result.fearSpent).toBe(1);
      expect(result.remainingFear).toBe(1);
      expect(result.mechanicalEffect?.type).toBe('extraGMAction');
    });

    it('useEnemyFearTrait — missing enemyId returns error', () => {
      const enemies = [makeEnemy()];
      const action: FearAction = { type: 'useEnemyFearTrait', cost: 1 };
      const result = resolveFearAction(action, 3, enemies);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('useEnemyFearTrait — with enemyId succeeds', () => {
      const enemies = [makeEnemy()];
      const action: FearAction = { type: 'useEnemyFearTrait', cost: 1, enemyId: 'enemy-1' };
      const result = resolveFearAction(action, 3, enemies);
      expect(result.success).toBe(true);
      expect(result.mechanicalEffect?.type).toBe('useEnemyFearTrait');
      expect(result.mechanicalEffect?.enemyId).toBe('enemy-1');
    });

    it('useEnvironmentTrait — always succeeds with enough Fear', () => {
      const action: FearAction = { type: 'useEnvironmentTrait', cost: 1 };
      const result = resolveFearAction(action, 2);
      expect(result.success).toBe(true);
      expect(result.mechanicalEffect?.type).toBe('useEnvironmentTrait');
    });

    it('addEnemyExperience — missing enemyId returns error', () => {
      const action: FearAction = { type: 'addEnemyExperience', cost: 1 };
      const result = resolveFearAction(action, 3);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('addEnemyExperience — enemy not found still succeeds (no combatEnemies)', () => {
      const action: FearAction = { type: 'addEnemyExperience', cost: 1, enemyId: 'nonexistent' };
      const result = resolveFearAction(action, 3, []);
      expect(result.success).toBe(true);
      expect(result.mechanicalEffect?.type).toBe('addEnemyExperience');
    });

    it('addEnemyExperience — with enemy experience returns modifier', () => {
      const enemies = [makeEnemy({
        experiences: [{ name: '伏击', modifier: 2, situation: '先手攻击' }],
      })];
      const action: FearAction = { type: 'addEnemyExperience', cost: 1, enemyId: 'enemy-1', experienceIndex: 0 };
      const result = resolveFearAction(action, 3, enemies);
      expect(result.success).toBe(true);
      expect(result.mechanicalEffect?.experienceModifier).toBe(2);
      expect(result.mechanicalEffect?.experienceName).toBe('伏击');
    });

    it('insufficient Fear returns error for all action types', () => {
      const actions: FearAction[] = [
        { type: 'interruptAction', cost: 1 },
        { type: 'extraGMAction', cost: 1 },
        { type: 'useEnemyFearTrait', cost: 1, enemyId: 'e1' },
        { type: 'useEnvironmentTrait', cost: 1 },
        { type: 'addEnemyExperience', cost: 1, enemyId: 'e1' },
      ];
      for (const action of actions) {
        const result = resolveFearAction(action, 0);
        expect(result.success).toBe(false);
        expect(result.fearSpent).toBe(0);
        expect(result.remainingFear).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('cost < 1 returns error', () => {
      const action: FearAction = { type: 'interruptAction', cost: 0 };
      const result = resolveFearAction(action, 5);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getAvailableFearActions', () => {
    it('returns empty when Fear is 0', () => {
      expect(getAvailableFearActions(0, false)).toHaveLength(0);
    });

    it('returns base actions when no combat', () => {
      const actions = getAvailableFearActions(2, false);
      expect(actions.length).toBeGreaterThanOrEqual(3);
      expect(actions.some(a => a.type === 'interruptAction')).toBe(true);
      expect(actions.some(a => a.type === 'extraGMAction')).toBe(true);
      expect(actions.some(a => a.type === 'useEnvironmentTrait')).toBe(true);
    });

    it('includes enemy-specific actions in combat', () => {
      const enemies = [makeEnemy({
        experiences: [{ name: '伏击', modifier: 2, situation: '先手攻击' }],
      })];
      const actions = getAvailableFearActions(2, true, enemies);
      expect(actions.some(a => a.type === 'useEnemyFearTrait')).toBe(true);
      expect(actions.some(a => a.type === 'addEnemyExperience')).toBe(true);
    });
  });
});
