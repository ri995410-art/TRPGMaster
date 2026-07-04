/**
 * Fear action system — structured Fear point spending for Daggerheart GM
 *
 * When the GM spends Fear, the mechanical effects are computed deterministically
 * by these functions. The AI only decides WHEN to spend Fear (a narrative decision)
 * and describes the result narratively.
 *
 * Rules reference: Daggerheart Core Rulebook p.154 "花费恐惧点"
 *
 * Each Fear costs 1 point and can be used to:
 * 1. Interrupt player to take a GM action
 * 2. Take an extra GM action
 * 3. Use an enemy's Fear trait
 * 4. Use an environment's Fear trait
 * 5. Add an enemy experience modifier to a roll
 */

import type { CombatEnemy } from '@trpgmaster/shared';

// ===== Fear Action Types =====

export type FearActionType =
  | 'interruptAction'      // 打断玩家来执行一个GM行动
  | 'extraGMAction'        // 执行一个额外的GM行动
  | 'useEnemyFearTrait'    // 使用敌人的恐惧特性
  | 'useEnvironmentTrait'  // 使用环境的恐惧特性
  | 'addEnemyExperience';  // 将敌人经历加值加入掷骰

export interface FearAction {
  type: FearActionType;
  cost: number;                   // Fear point cost (always >= 1)
  enemyId?: string;               // Target enemy for useEnemyFearTrait / addEnemyExperience
  experienceIndex?: number;       // Which enemy experience to apply
  description?: string;           // Narrative description
}

export interface FearActionResult {
  success: boolean;
  fearSpent: number;
  remainingFear: number;
  effect: string;                  // Human-readable effect description
  mechanicalEffect?: {
    type: FearActionType;
    enemyId?: string;
    experienceModifier?: number;
    experienceName?: string;
    traitName?: string;
  };
  errors: string[];
}

// ===== Fear Action Resolution =====

/**
 * Validate and resolve a Fear action
 */
export function resolveFearAction(
  action: FearAction,
  currentFear: number,
  combatEnemies?: CombatEnemy[],
): FearActionResult {
  const errors: string[] = [];

  // Validate Fear cost
  if (action.cost < 1) {
    errors.push('恐惧行动至少需要1恐惧点');
    return { success: false, fearSpent: 0, remainingFear: currentFear, effect: '', errors };
  }

  if (currentFear < action.cost) {
    errors.push(`恐惧点不足：需要${action.cost}点，当前只有${currentFear}点`);
    return { success: false, fearSpent: 0, remainingFear: currentFear, effect: '', errors };
  }

  const remainingFear = currentFear - action.cost;
  let effect = '';
  let mechanicalEffect: FearActionResult['mechanicalEffect'];

  switch (action.type) {
    case 'interruptAction': {
      effect = 'GM打断玩家行动，执行一个GM行动（如聚焦一个敌人）。';
      mechanicalEffect = { type: 'interruptAction' };
      break;
    }

    case 'extraGMAction': {
      effect = 'GM在当前轮次执行一个额外的GM行动。';
      mechanicalEffect = { type: 'extraGMAction' };
      break;
    }

    case 'useEnemyFearTrait': {
      if (!action.enemyId && combatEnemies && combatEnemies.length > 0) {
        errors.push('请指定使用哪个敌人的恐惧特性');
        break;
      }
      const enemy = combatEnemies?.find(e => e.id === action.enemyId);
      if (enemy) {
        effect = `${enemy.name}使用恐惧特性。`;
        mechanicalEffect = { type: 'useEnemyFearTrait', enemyId: action.enemyId };
      } else {
        effect = '使用一个敌人的恐惧特性。';
        mechanicalEffect = { type: 'useEnemyFearTrait', enemyId: action.enemyId };
      }
      break;
    }

    case 'useEnvironmentTrait': {
      effect = '触发环境的恐惧特性。';
      mechanicalEffect = { type: 'useEnvironmentTrait' };
      break;
    }

    case 'addEnemyExperience': {
      if (!action.enemyId) {
        errors.push('请指定使用哪个敌人的经历');
        break;
      }
      const expEnemy = combatEnemies?.find(e => e.id === action.enemyId);
      if (expEnemy) {
        const expIdx = action.experienceIndex ?? 0;
        const exp = expEnemy.experiences?.[expIdx];
        if (exp) {
          effect = `${expEnemy.name}使用经历"${exp.name}"(+${exp.modifier})加入掷骰。`;
          mechanicalEffect = {
            type: 'addEnemyExperience',
            enemyId: action.enemyId,
            experienceModifier: exp.modifier,
            experienceName: exp.name,
          };
        } else {
          effect = `${expEnemy.name}将经历加值加入掷骰。`;
          mechanicalEffect = { type: 'addEnemyExperience', enemyId: action.enemyId };
        }
      } else {
        effect = '将敌人经历加值加入掷骰。';
        mechanicalEffect = { type: 'addEnemyExperience', enemyId: action.enemyId };
      }
      break;
    }

    default: {
      errors.push(`未知的恐惧行动类型: ${action.type}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, fearSpent: 0, remainingFear: currentFear, effect: '', errors };
  }

  return {
    success: true,
    fearSpent: action.cost,
    remainingFear,
    effect,
    mechanicalEffect,
    errors: [],
  };
}

/**
 * Get available Fear actions based on current game state
 */
export function getAvailableFearActions(
  currentFear: number,
  hasCombat: boolean,
  combatEnemies?: CombatEnemy[],
): FearAction[] {
  if (currentFear < 1) return [];

  const actions: FearAction[] = [
    {
      type: 'interruptAction',
      cost: 1,
      description: '打断玩家来执行一个GM行动',
    },
    {
      type: 'extraGMAction',
      cost: 1,
      description: '执行一个额外的GM行动',
    },
    {
      type: 'useEnvironmentTrait',
      cost: 1,
      description: '使用环境的恐惧特性',
    },
  ];

  // Add enemy-specific actions if in combat
  // Rules: Ch3 "花费恐惧点" — enemy fear trait costs vary per enemy
  if (hasCombat && combatEnemies) {
    for (const enemy of combatEnemies) {
      // Use actual fear trait costs from enemy data instead of hardcoded 1
      const fearFeatures = enemy.features?.filter(f => f.type === 'fear') || [];
      if (fearFeatures.length > 0) {
        for (const feature of fearFeatures) {
          actions.push({
            type: 'useEnemyFearTrait',
            cost: feature.cost || 1,
            enemyId: enemy.id,
            description: `${enemy.name}的恐惧特性"${feature.name}"(${feature.cost || 1}恐惧)`,
          });
        }
      } else {
        // Fallback if no fear features defined
        actions.push({
          type: 'useEnemyFearTrait',
          cost: 1,
          enemyId: enemy.id,
          description: `${enemy.name}的恐惧特性`,
        });
      }
      if (enemy.experiences && enemy.experiences.length > 0) {
        actions.push({
          type: 'addEnemyExperience',
          cost: 1,
          enemyId: enemy.id,
          description: `${enemy.name}的经历加值`,
        });
      }
    }
  }

  return actions;
}

/**
 * Format Fear action result for AI narration context
 */
export function formatFearActionResult(result: FearActionResult): string {
  if (!result.success) {
    return `【恐惧行动失败】${result.errors.join('；')}`;
  }
  return `【恐惧行动已结算】花费${result.fearSpent}恐惧点（剩余${result.remainingFear}）。${result.effect}`;
}
