/**
 * Combat application layer — writes resolved combat results into StateManager
 * All clamping is done here (via StateManager methods).
 */
import type { StateManager } from '../core/StateManager';
import type { AttackResolution, DamageResolution, EnemyAttackResolution } from '@trpgmaster/shared';

export function applyPlayerAttack(
  sm: StateManager,
  attackerPlayerId: string,
  enemyId: string,
  r: AttackResolution,
): void {
  if (r.hopeGain > 0) sm.updateCharacterHope(r.hopeGain);
  if (r.stressCleared > 0) sm.updateCharacterStress(-r.stressCleared);
  if (r.fearGain > 0) sm.addFearPoints(r.fearGain);
  if (r.hpLossToTarget > 0) sm.updateCombatEnemyHp(enemyId, -r.hpLossToTarget);

  // 杂兵额外击败：溢出伤害额外击败同类型杂兵
  if (r.minionsExtraDefeated && r.minionsExtraDefeated > 0) {
    const combat = sm.getCombatState();
    if (combat) {
      const target = combat.enemies.find(e => e.id === enemyId);
      const statBlockId = target?.statBlockId;
      if (statBlockId) {
        // 找到同类杂兵（同statBlockId、不同id、仍存活）
        const sameMinions = combat.enemies.filter(
          e => e.id !== enemyId && e.statBlockId === statBlockId && e.currentHp > 0,
        );
        const toRemove = Math.min(r.minionsExtraDefeated, sameMinions.length);
        for (let i = 0; i < toRemove; i++) {
          sm.removeCombatEnemy(sameMinions[i].id);
        }
      }
    }
  }
}

export function applyDamageToCharacter(
  sm: StateManager,
  playerId: string,
  r: DamageResolution,
): void {
  if (r.armorSlotsSpent > 0) sm.adjustCharacterArmorSlots(-r.armorSlotsSpent);
  if (r.hpLoss > 0) sm.updateCharacterHp(-r.hpLoss);
  // Rules: Chapter 2 "伤害掷骰" — damage below minor threshold marks 1 stress
  if (r.stressGain > 0) sm.updateCharacterStress(r.stressGain);
}

/** Apply an enemy attack result to state (handles hit/miss and all effects) */
export function applyEnemyAttackToCharacter(
  sm: StateManager,
  r: EnemyAttackResolution,
): void {
  if (!r.attackHit) return; // Miss — no effects applied

  if (r.armorSlotsSpent > 0) sm.adjustCharacterArmorSlots(-r.armorSlotsSpent);
  if (r.hpLoss > 0) sm.updateCharacterHp(-r.hpLoss);
  if (r.stressDamage > 0) sm.updateCharacterStress(r.stressDamage);
  if (r.conditionApplied) {
    sm.addCharacterCondition({
      condition: r.conditionApplied,
      duration: 'temporary',
      source: '敌人攻击',
      roundsRemaining: r.conditionDuration,
    });
  }
}
