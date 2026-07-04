import { spawnEncounter, statBlockToCombatEnemy, buildNarrationPrompt, getTierFromLevel, type EncounterDifficulty } from '../../rules/systems/encounterSpawner';
import type { EnemyStatBlock } from '@trpgmaster/shared';

// ===== Fixtures =====

const tier1Minion: EnemyStatBlock = {
  id: 'goblin', name: '哥布林', nameEn: 'Goblin', type: 'minion', behavior: 'bruiser',
  difficulty: 11, evasion: 10, hp: 1, maxHp: 1, stress: 1, maxStress: 1,
  attacks: [{ name: '短刀', attribute: 'agility', distance: 'melee', damage: { dice: [{ count: 1, sides: 6 }], modifier: 0, type: 'physical' }, targets: 'single' }],
  features: [], fearCost: 0, tier: 1, minionDefeatThreshold: 3,
};

const tier1Standard: EnemyStatBlock = {
  id: 'bandit', name: '强盗', nameEn: 'Bandit', type: 'standard', behavior: 'ambusher',
  difficulty: 12, evasion: 11, hp: 5, maxHp: 5, stress: 3, maxStress: 3,
  attacks: [{ name: '弯刀', attribute: 'agility', distance: 'melee', damage: { dice: [{ count: 1, sides: 8 }], modifier: 1, type: 'physical' }, targets: 'single' }],
  features: [], fearCost: 1, tier: 1, majorThreshold: 7, severeThreshold: 12,
};

const tier1Solo: EnemyStatBlock = {
  id: 'acid-burrower', name: '酸液掘虫', nameEn: 'Acid Burrower', type: 'solo', behavior: 'solo',
  difficulty: 14, evasion: 10, hp: 8, maxHp: 8, stress: 3, maxStress: 3,
  attacks: [{ name: '酸液', attribute: 'instinct', distance: 'nearby', damage: { dice: [{ count: 1, sides: 12 }], modifier: 2, type: 'magical' }, targets: 'single' }],
  features: [], fearCost: 2, tier: 1, majorThreshold: 7, severeThreshold: 12,
};

const tier2Standard: EnemyStatBlock = {
  id: 'shadow-mage', name: '暗影法师', nameEn: 'Shadow Mage', type: 'standard', behavior: 'caster',
  difficulty: 14, evasion: 11, hp: 4, maxHp: 4, stress: 3, maxStress: 3,
  attacks: [{ name: '暗影箭', attribute: 'knowledge', distance: 'far', damage: { dice: [{ count: 2, sides: 6 }], modifier: 3, type: 'magical' }, targets: 'single' }],
  features: [], fearCost: 2, tier: 2, majorThreshold: 10, severeThreshold: 20,
};

const allEnemies: EnemyStatBlock[] = [tier1Minion, tier1Standard, tier1Solo, tier2Standard];

// Deterministic RNG for testing
function makeRng(sequence: number[]): () => number {
  let idx = 0;
  return () => sequence[idx++ % sequence.length];
}

// ===== Tests =====

describe('encounterSpawner', () => {
  describe('getTierFromLevel', () => {
    it('maps levels to tiers correctly', () => {
      expect(getTierFromLevel(1)).toBe(1);
      expect(getTierFromLevel(2)).toBe(2);
      expect(getTierFromLevel(4)).toBe(2);
      expect(getTierFromLevel(5)).toBe(3);
      expect(getTierFromLevel(7)).toBe(3);
      expect(getTierFromLevel(8)).toBe(4);
      expect(getTierFromLevel(10)).toBe(4);
    });
  });

  describe('spawnEncounter', () => {
    it('returns enemies for tier 1 party', () => {
      const result = spawnEncounter(1, 3, allEnemies, 'moderate', [], makeRng([0.3, 0.5, 0.7, 0.2, 0.8]));
      expect(result.enemies.length).toBeGreaterThanOrEqual(2);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.budget).toBeGreaterThan(0);
    });

    it('respects encounter difficulty scaling', () => {
      const rng = makeRng([0.3, 0.5, 0.7, 0.2, 0.8, 0.4, 0.6, 0.1, 0.9, 0.5]);
      const easy = spawnEncounter(1, 3, allEnemies, 'easy', [], rng);
      const deadly = spawnEncounter(1, 3, allEnemies, 'deadly', [], makeRng([0.3, 0.5, 0.7, 0.2, 0.8, 0.4, 0.6, 0.1, 0.9, 0.5]));
      // Deadly should have higher budget (and likely more enemies or cost)
      expect(deadly.budget).toBeGreaterThan(easy.budget);
    });

    it('returns empty for no eligible enemies', () => {
      const result = spawnEncounter(4, 3, allEnemies, 'moderate');
      // No tier 4 enemies in fixture, and tier 3+ is also missing
      expect(result.enemies.length).toBe(0);
    });

    it('never exceeds MAX_ENEMIES', () => {
      const result = spawnEncounter(1, 10, allEnemies, 'deadly');
      expect(result.enemies.length).toBeLessThanOrEqual(8);
    });
  });

  describe('statBlockToCombatEnemy', () => {
    it('converts stat block to combat enemy correctly', () => {
      const enemy = statBlockToCombatEnemy(tier1Standard, 0);
      expect(enemy.statBlockId).toBe('bandit');
      expect(enemy.name).toBe('强盗');
      expect(enemy.currentHp).toBe(5);
      expect(enemy.maxHp).toBe(5);
      expect(enemy.currentStress).toBe(0);
      expect(enemy.maxStress).toBe(3);
      expect(enemy.evasion).toBe(11);
      expect(enemy.behavior).toBe('ambusher');
      expect(enemy.type).toBe('standard');
      expect(enemy.majorThreshold).toBe(7);
      expect(enemy.severeThreshold).toBe(12);
      expect(enemy.conditions).toEqual([]);
      expect(enemy.isFocused).toBe(false);
      expect(enemy.hasActed).toBe(false);
    });

    it('handles minion stat blocks', () => {
      const enemy = statBlockToCombatEnemy(tier1Minion, 0);
      expect(enemy.currentHp).toBe(1);
      expect(enemy.maxHp).toBe(1);
      expect(enemy.minionDefeatThreshold).toBe(3);
    });

    it('extracts fear traits from features', () => {
      const sbWithFear: EnemyStatBlock = {
        ...tier1Standard,
        features: [
          { name: '脱战', type: 'fear', cost: 1, description: '花费1恐惧脱离战斗' },
        ],
      };
      const enemy = statBlockToCombatEnemy(sbWithFear, 0);
      expect(enemy.fearTraits).toHaveLength(1);
      expect(enemy.fearTraits![0]).toEqual({ name: '脱战', cost: 1, description: '花费1恐惧脱离战斗' });
    });
  });

  describe('buildNarrationPrompt', () => {
    it('produces non-empty narration text', () => {
      const prompt = buildNarrationPrompt([tier1Standard, tier1Minion], 1);
      expect(prompt).toContain('战斗遭遇');
      expect(prompt).toContain('强盗');
      expect(prompt).toContain('哥布林');
    });

    it('includes attack and feature details', () => {
      const prompt = buildNarrationPrompt([tier1Standard], 1);
      expect(prompt).toContain('弯刀');
      expect(prompt).toContain('闪避');
    });

    it('returns empty string for no enemies', () => {
      expect(buildNarrationPrompt([], 1)).toBe('');
    });

    it('groups duplicate enemies', () => {
      const prompt = buildNarrationPrompt([tier1Minion, tier1Minion, tier1Minion], 1);
      expect(prompt).toContain('×3');
    });
  });
});
