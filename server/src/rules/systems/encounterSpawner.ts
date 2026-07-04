/**
 * Encounter Spawner — Generate balanced Daggerheart combat encounters
 *
 * Uses the combat point budget system (Chapter 4) to randomly select enemies
 * from the data that match the player tier, then converts them into CombatEnemy
 * instances ready for the combat engine.
 *
 * Also provides LLM-readable enemy descriptions for AI narration.
 */

import type { CombatEnemy, EnemyFearTrait } from '@trpgmaster/shared';
import type { EnemyStatBlock } from '@trpgmaster/shared';
import {
  calculateEncounterBudget,
  getEnemyCombatPointCost,
  type EncounterAdjustment,
} from './encounterBuilder';

// ===== Configuration =====

/** How hard the encounter should be relative to budget */
export type EncounterDifficulty = 'easy' | 'moderate' | 'hard' | 'deadly';

const DIFFICULTY_BUDGET_MULT: Record<EncounterDifficulty, number> = {
  easy: 0.6,
  moderate: 1.0,
  hard: 1.3,
  deadly: 1.6,
};

/** Minimum number of enemies for a satisfying fight */
const MIN_ENEMIES = 2;
/** Maximum enemies to prevent combat dragging */
const MAX_ENEMIES = 8;

// ===== Spawner result =====

export interface SpawnedEncounter {
  enemies: CombatEnemy[];
  /** LLM-readable text block describing all enemies */
  narrationPrompt: string;
  /** How many combat points were spent */
  totalCost: number;
  /** The budget that was available */
  budget: number;
}

// ===== Core spawner =====

/**
 * Spawn a balanced encounter from available enemy stat blocks.
 *
 * @param playerTier  1-4, derived from average player level
 * @param playerCount how many PCs are in the session
 * @param allEnemies  the full enemy catalog (from enemies.json via DataProvider)
 * @param difficulty  encounter intensity modifier
 * @param adjustments situational modifiers (terrain, surprise, etc.)
 * @param seed        optional RNG seed for deterministic testing
 */
export function spawnEncounter(
  playerTier: number,
  playerCount: number,
  allEnemies: EnemyStatBlock[],
  difficulty: EncounterDifficulty = 'moderate',
  adjustments: EncounterAdjustment[] = [],
  seed?: () => number,
): SpawnedEncounter {
  const rng = seed ?? Math.random;
  const budget = calculateEncounterBudget(playerCount, adjustments);
  const adjustedBudget = Math.floor(budget.totalPoints * DIFFICULTY_BUDGET_MULT[difficulty]);

  // Filter enemies to appropriate tier range (allow ±1 tier for variety)
  const eligible = allEnemies.filter(e =>
    e.tier >= playerTier - 1 && e.tier <= playerTier + 1,
  );
  if (eligible.length === 0) {
    // Fallback: use any enemy at exact tier
    const fallback = allEnemies.filter(e => e.tier === playerTier);
    if (fallback.length === 0) {
      return { enemies: [], narrationPrompt: '', totalCost: 0, budget: adjustedBudget };
    }
    return buildEncounter(fallback, adjustedBudget, playerTier, rng);
  }

  return buildEncounter(eligible, adjustedBudget, playerTier, rng);
}

function buildEncounter(
  pool: EnemyStatBlock[],
  budget: number,
  playerTier: number,
  rng: () => number,
): SpawnedEncounter {
  const selected: EnemyStatBlock[] = [];
  let spent = 0;

  // Strategy: prefer a "leader + minions" or "solo + support" composition
  // First pass: try to pick a featured enemy (solo/leader/boss)
  const featured = pool.filter(e =>
    e.type === 'solo' || e.type === 'boss' || e.type === 'leader',
  );
  const fillers = pool.filter(e =>
    e.type !== 'solo' && e.type !== 'boss' && e.type !== 'leader',
  );

  // 50% chance to lead with a featured enemy if one exists within budget
  if (featured.length > 0 && rng() < 0.5) {
    const affordable = featured.filter(e =>
      getEnemyCombatPointCost(e.type, e.tier) <= budget,
    );
    if (affordable.length > 0) {
      const pick = affordable[Math.floor(rng() * affordable.length)];
      const cost = getEnemyCombatPointCost(pick.type, pick.tier);
      selected.push(pick);
      spent += cost;
    }
  }

  // Fill remaining budget with filler enemies, preferring variety
  const usedIds = new Set(selected.map(e => e.id));
  let attempts = 0;
  while (spent < budget && selected.length < MAX_ENEMIES && attempts < 30) {
    attempts++;
    // Prefer tier-matching enemies, allow ±1
    const candidates = fillers.filter(e => {
      const cost = getEnemyCombatPointCost(e.type, e.tier);
      if (spent + cost > budget) return false;
      // Limit same enemy to 3 copies
      const copies = selected.filter(s => s.id === e.id).length;
      if (copies >= 3) return false;
      return true;
    });

    if (candidates.length === 0) break;

    // Weighted random: prefer enemies we haven't picked yet
    const weights = candidates.map(c => {
      const copies = selected.filter(s => s.id === c.id).length;
      return copies === 0 ? 3 : 1; // new enemies 3x more likely
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * totalWeight;
    let pickIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pickIdx = i; break; }
    }

    const pick = candidates[pickIdx];
    const cost = getEnemyCombatPointCost(pick.type, pick.tier);
    selected.push(pick);
    spent += cost;
    usedIds.add(pick.id);
  }

  // Ensure minimum enemies
  if (selected.length < MIN_ENEMIES && fillers.length > 0) {
    while (selected.length < MIN_ENEMIES) {
      const cheapest = fillers
        .filter(e => getEnemyCombatPointCost(e.type, e.tier) + spent <= budget * 1.5)
        .sort((a, b) => getEnemyCombatPointCost(a.type, a.tier) - getEnemyCombatPointCost(b.type, b.tier));
      if (cheapest.length === 0) break;
      const pick = cheapest[0];
      selected.push(pick);
      spent += getEnemyCombatPointCost(pick.type, pick.tier);
    }
  }

  // Convert to CombatEnemy instances
  const enemies = selected.map((sb, idx) => statBlockToCombatEnemy(sb, idx, rng));

  // Build LLM narration prompt
  const narrationPrompt = buildNarrationPrompt(selected, playerTier);

  return { enemies, narrationPrompt, totalCost: spent, budget };
}

/**
 * Convert an EnemyStatBlock (template) to a CombatEnemy (runtime instance).
 */
export function statBlockToCombatEnemy(
  sb: EnemyStatBlock,
  index: number,
  rng: () => number = Math.random,
): CombatEnemy {
  const maxHp = sb.maxHp ?? sb.hp ?? 5;
  const maxStress = sb.maxStress ?? sb.stress ?? 3;

  // For minions: generate a unique-ish name if there are duplicates
  const name = sb.name;

  return {
    id: `enemy_${Date.now()}_${index}_${Math.floor(rng() * 10000)}`,
    statBlockId: sb.id,
    name,
    currentHp: maxHp,
    maxHp,
    currentStress: 0,
    maxStress,
    conditions: [],
    isFocused: false,
    hasActed: false,
    evasion: sb.evasion || 10,
    behavior: sb.behavior || 'bruiser',
    attacks: sb.attacks || [],
    features: sb.features || [],
    experiences: sb.experiences || [],
    fearTraits: (sb.features || [])
      .filter(f => f.type === 'fear')
      .map(f => ({ name: f.name, cost: f.cost, description: f.description })),
    type: sb.type,
    majorThreshold: sb.majorThreshold,
    severeThreshold: sb.severeThreshold,
    minionDefeatThreshold: sb.minionDefeatThreshold,
    hordeDamage: sb.type === 'horde' ? (sb as any).hordeDamage : undefined,
    relentlessCount: (sb as any).relentlessCount,
    isSlow: (sb as any).isSlow,
    timesFocusedThisTurn: 0,
  };
}

/**
 * Build a narration-friendly description of the encounter for the LLM.
 */
export function buildNarrationPrompt(
  enemies: EnemyStatBlock[],
  playerTier: number,
): string {
  if (enemies.length === 0) return '';

  const tierLabels: Record<number, string> = {
    1: '一阶（初级）',
    2: '二阶（中级）',
    3: '三阶（高级）',
    4: '四阶（史诗）',
  };

  // Group by statBlockId for cleaner output
  const groups = new Map<string, { statBlock: EnemyStatBlock; count: number }>();
  for (const e of enemies) {
    const existing = groups.get(e.id);
    if (existing) {
      existing.count++;
    } else {
      groups.set(e.id, { statBlock: e, count: 1 });
    }
  }

  const lines: string[] = [
    `【战斗遭遇 — ${tierLabels[playerTier] ?? playerTier + '阶'}】`,
    '',
    '敌人阵容：',
  ];

  for (const [, { statBlock: sb, count }] of groups) {
    const countStr = count > 1 ? ` ×${count}` : '';
    const typeLabel = {
      minion: '杂兵', horde: '集群', standard: '普通', elite: '精英',
      solo: '独体', boss: '首领', bruiser: '重击手', leader: '首领',
      support: '辅助', ranged: '远程', skulker: '潜行者', social: '社交',
    }[sb.type] ?? sb.type;

    lines.push(`■ ${sb.name}${countStr}（${typeLabel}, 难度${sb.difficulty}）`);
    if (sb.description) lines.push(`  ${sb.description}`);

    // Attacks
    for (const atk of sb.attacks || []) {
      const diceStr = atk.damage.dice.map(d => `${d.count}d${d.sides}`).join('+');
      const modStr = atk.damage.modifier ? `+${atk.damage.modifier}` : '';
      lines.push(`  攻击: ${atk.name} (${atk.distance}, ${diceStr}${modStr} ${atk.damage.type}伤害)`);
    }

    // Features
    for (const feat of sb.features || []) {
      const costStr = feat.type === 'fear' ? ` [恐惧${feat.cost}]` : '';
      lines.push(`  特性: ${feat.name}${costStr} — ${feat.description}`);
    }

    // Key stats
    const hpStr = sb.type === 'minion' ? '1HP' : `${sb.hp}HP`;
    const thresholdStr = sb.majorThreshold
      ? ` 伤害阈值: 重度${sb.majorThreshold}/严重${sb.severeThreshold}`
      : '';
    lines.push(`  ${hpStr} ${sb.stress}压力 闪避${sb.evasion}${thresholdStr}`);
    lines.push('');
  }

  lines.push('请在叙事中自然地引入这些敌人，描述它们的外貌、行为和威胁感。利用敌人的特性和攻击方式来丰富战斗场景的描述。');

  return lines.join('\n');
}

/**
 * Determine player tier from character level.
 * Daggerheart: Tier 1 = level 1, Tier 2 = levels 2-4, Tier 3 = levels 5-7, Tier 4 = levels 8-10
 */
export function getTierFromLevel(level: number): number {
  if (level <= 1) return 1;
  if (level <= 4) return 2;
  if (level <= 7) return 3;
  return 4;
}
