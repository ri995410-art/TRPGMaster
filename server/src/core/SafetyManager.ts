import type { SafetyState } from '@trpgmaster/shared';

/**
 * SafetyManager — pure logic for safety tools.
 * Lines/Veils, X-Card, S0 gate.
 *
 * All methods are pure: take state, return new state. No side effects.
 */
export class SafetyManager {
  /**
   * Can players take game actions?
   * Returns false during Session Zero (phase === 's0') or when X-Card is active.
   */
  canPlay(safety: SafetyState | undefined): boolean {
    if (!safety) return true; // Single-player: no safety gate
    if (safety.phase === 's0') return false;
    if (safety.xcardActive) return false;
    return true;
  }

  /**
   * Submit Lines/Veils/ToneFlags from a player during S0.
   * Aggregates (deduplicates) into the shared state.
   * Returns new SafetyState.
   */
  submitLinesVeils(
    safety: SafetyState,
    _playerId: string,
    lines: string[],
    veils: string[],
    toneFlags: string[],
  ): SafetyState {
    const mergedLines = [...new Set([...safety.lines, ...lines])];
    const mergedVeils = [...new Set([...safety.veils, ...veils])];
    const mergedTone = [...new Set([...safety.toneFlags, ...toneFlags])];

    return {
      ...safety,
      lines: mergedLines,
      veils: mergedVeils,
      toneFlags: mergedTone,
    };
  }

  /**
   * Mark S0 as complete and transition to play phase.
   */
  completeS0(safety: SafetyState): SafetyState {
    return { ...safety, phase: 'play' };
  }

  /**
   * Activate X-Card — anonymous, pauses everything.
   */
  activateXCard(safety: SafetyState): SafetyState {
    return { ...safety, xcardActive: true };
  }

  /**
   * Deactivate X-Card — host only.
   */
  deactivateXCard(safety: SafetyState): SafetyState {
    return { ...safety, xcardActive: false };
  }

  /**
   * Is the game paused (X-Card active)?
   */
  isPaused(safety: SafetyState | undefined): boolean {
    if (!safety) return false;
    return safety.xcardActive;
  }
}
