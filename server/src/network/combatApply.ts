/**
 * Combat application layer — writes resolved combat results into StateManager
 * All clamping is done here (via StateManager methods).
 */
import type { StateManager } from '../core/StateManager';
import type { AttackResolution, DamageResolution } from '@trpgmaster/shared';

export function applyPlayerAttack(
  sm: StateManager,
  attackerPlayerId: string,
  enemyId: string,
  r: AttackResolution,
): void {
  if (r.hopeGain > 0) sm.updateCharacterHope(r.hopeGain);
  if (r.fearGain > 0) sm.addFearPoints(r.fearGain);
  if (r.hpLossToTarget > 0) sm.updateCombatEnemyHp(enemyId, -r.hpLossToTarget);
}

export function applyDamageToCharacter(
  sm: StateManager,
  playerId: string,
  r: DamageResolution,
): void {
  if (r.armorSlotsSpent > 0) sm.adjustCharacterArmorSlots(-r.armorSlotsSpent);
  if (r.hpLoss > 0) sm.updateCharacterHp(-r.hpLoss);
  if (r.stressGain > 0) sm.updateCharacterStress(r.stressGain);
}
