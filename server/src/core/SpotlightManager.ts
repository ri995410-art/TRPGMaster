import type { SpotlightState } from '@trpgmaster/shared';

/**
 * SpotlightManager — pure logic for turn management.
 * Freeform mode: GM passes spotlight, players queue to act.
 * Combat mode: ordered turns with round counter.
 *
 * All methods are pure: take state, return new state. No side effects.
 */
export class SpotlightManager {
  /**
   * Player requests to act.
   * If no one holds the spotlight → grant it (return state with current=playerId).
   * If someone else holds it → add to queue.
   * If this player already holds it → no-op.
   */
  request(state: SpotlightState, playerId: string): SpotlightState {
    if (state.current === playerId) return state; // already holding
    if (state.current === null) {
      return { ...state, current: playerId };
    }
    // Already in queue? No-op
    if (state.queue.includes(playerId)) return state;
    return { ...state, queue: [...state.queue, playerId] };
  }

  /**
   * Pass the spotlight to the next player.
   * If targetPlayerId specified and valid → pass to them.
   * Otherwise → take the first from the queue.
   * If queue empty → spotlight goes to null (no one acting).
   */
  pass(state: SpotlightState, targetPlayerId?: string): SpotlightState {
    if (state.mode === 'combat') {
      return this.advanceCombat(state);
    }

    if (targetPlayerId) {
      // Remove target from queue if present
      const newQueue = state.queue.filter(id => id !== targetPlayerId);
      return { ...state, current: targetPlayerId, queue: newQueue };
    }

    // Take from queue front
    if (state.queue.length > 0) {
      const [next, ...rest] = state.queue;
      return { ...state, current: next, queue: rest };
    }

    // No one waiting
    return { ...state, current: null };
  }

  /**
   * Can this player act right now?
   * In freeform: only the current holder can act.
   * In combat: only the current holder (per order) can act.
   * If current is null, anyone can act (first-come-first-serve).
   */
  canAct(state: SpotlightState | undefined, playerId: string): boolean {
    if (!state) return true; // Single-player: no spotlight → anyone can act
    if (state.current === null) return true; // No holder → open
    return state.current === playerId;
  }

  /**
   * Enter combat mode with a turn order.
   * Sets mode=combat, order, round=1, current=first in order.
   */
  enterCombat(state: SpotlightState, order: string[]): SpotlightState {
    if (order.length === 0) return state;
    return {
      ...state,
      mode: 'combat',
      order,
      round: 1,
      current: order[0],
      queue: [],
    };
  }

  /**
   * Advance to next combatant in order.
   * Wraps around and increments round when the last combatant acts.
   */
  advanceCombat(state: SpotlightState): SpotlightState {
    if (!state.order || state.order.length === 0) return state;

    const currentIndex = state.order.indexOf(state.current || '');
    if (currentIndex < 0) {
      // Current not in order — start from beginning
      return { ...state, current: state.order[0], round: (state.round || 1) };
    }

    const nextIndex = (currentIndex + 1) % state.order.length;
    const newRound = nextIndex === 0 ? (state.round || 1) + 1 : (state.round || 1);

    return {
      ...state,
      current: state.order[nextIndex],
      round: newRound,
    };
  }

  /**
   * Exit combat mode. Return to freeform with empty queue.
   */
  exitCombat(state: SpotlightState): SpotlightState {
    return {
      mode: 'freeform',
      current: null,
      queue: [],
    };
  }

  /**
   * Remove a player from the spotlight system (e.g., on disconnect).
   * If they held the spotlight, pass to next.
   */
  removePlayer(state: SpotlightState, playerId: string): SpotlightState {
    if (state.current === playerId) {
      return this.pass(state);
    }
    return { ...state, queue: state.queue.filter(id => id !== playerId) };
  }
}
