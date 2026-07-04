/**
 * Encounter builder — Combat Point system for Daggerheart encounter balancing
 * Rules reference: Chapter 4 "战斗点数系统"
 *
 * Base formula: (3 × player count) + 2
 * Adjustments modify the total available combat points.
 */

export interface EncounterBudget {
  basePoints: number;
  adjustments: EncounterAdjustment[];
  totalPoints: number;
}

export interface EncounterAdjustment {
  type: EncounterAdjustmentType;
  description: string;
  pointChange: number;
}

/** 6 adjustment types from Chapter 4 */
export type EncounterAdjustmentType =
  | 'difficultTerrain'     // 困难地形: +1
  | 'environmentalHazard'  // 环境危险: +1
  | 'reinforcements'       // 增援: +2
  | 'playerAdvantage'      // 玩境优势: -1
  | 'surprise'             // 奇袭: -2
  | 'outnumbered';         // 敌众我寡: +1 per extra enemy group

/** Rules: Chapter 4 — base combat points = (3 × player count) + 2 */
export function calculateBaseCombatPoints(playerCount: number): number {
  return (3 * playerCount) + 2;
}

/** Calculate total encounter budget with adjustments */
export function calculateEncounterBudget(
  playerCount: number,
  adjustments: EncounterAdjustment[] = [],
): EncounterBudget {
  const basePoints = calculateBaseCombatPoints(playerCount);
  const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.pointChange, 0);
  const totalPoints = Math.max(1, basePoints + adjustmentTotal);

  return { basePoints, adjustments, totalPoints };
}

/** Get the point cost for an enemy by type — Chapter 4 "敌人类型" */
export function getEnemyCombatPointCost(
  enemyType: string,
  tier: number,
): number {
  // Base costs by type from Chapter 4
  const baseCosts: Record<string, number> = {
    minion: 1,
    horde: 2,
    standard: 2,
    support: 2,
    ranged: 2,
    skulker: 2,
    social: 2,
    bruiser: 3,
    leader: 3,
    solo: 4,
  };

  const base = baseCosts[enemyType] ?? 2;
  // Tier multiplier: tier 1 = ×1, tier 2 = ×2, tier 3 = ×3, tier 4 = ×4
  return base * Math.max(1, tier);
}

/** Validate that an encounter fits within the budget */
export function validateEncounterBudget(
  budget: EncounterBudget,
  enemies: Array<{ type: string; tier: number; count: number }>,
): { valid: boolean; totalCost: number; overBudget: number } {
  const totalCost = enemies.reduce(
    (sum, e) => sum + getEnemyCombatPointCost(e.type, e.tier) * e.count,
    0,
  );
  const overBudget = Math.max(0, totalCost - budget.totalPoints);
  return { valid: totalCost <= budget.totalPoints, totalCost, overBudget };
}
