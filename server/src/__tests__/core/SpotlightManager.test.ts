import { SpotlightManager } from '../../core/SpotlightManager';
import type { SpotlightState } from '@trpgmaster/shared';

const freeformIdle: SpotlightState = { mode: 'freeform', current: null, queue: [] };

describe('SpotlightManager', () => {
  let mgr: SpotlightManager;
  beforeEach(() => { mgr = new SpotlightManager(); });

  describe('request', () => {
    test('grants spotlight if no one holds it', () => {
      const next = mgr.request(freeformIdle, 'p1');
      expect(next.current).toBe('p1');
      expect(next.queue).toEqual([]);
    });

    test('enqueues if someone else holds it', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: [] };
      const next = mgr.request(state, 'p2');
      expect(next.current).toBe('p1');
      expect(next.queue).toEqual(['p2']);
    });

    test('no-op if player already holds spotlight', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: [] };
      const next = mgr.request(state, 'p1');
      expect(next).toBe(state);
    });

    test('no-op if player already in queue', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: ['p2'] };
      const next = mgr.request(state, 'p2');
      expect(next).toBe(state);
    });
  });

  describe('pass', () => {
    test('passes to target if specified', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: ['p3'] };
      const next = mgr.pass(state, 'p2');
      expect(next.current).toBe('p2');
      expect(next.queue).toEqual(['p3']);
    });

    test('takes from queue front if no target', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: ['p2', 'p3'] };
      const next = mgr.pass(state);
      expect(next.current).toBe('p2');
      expect(next.queue).toEqual(['p3']);
    });

    test('spotlight goes null if queue empty', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: [] };
      const next = mgr.pass(state);
      expect(next.current).toBeNull();
    });

    test('in combat mode, delegates to advanceCombat', () => {
      const state: SpotlightState = { mode: 'combat', current: 'p1', queue: [], order: ['p1', 'p2'], round: 1 };
      const next = mgr.pass(state);
      expect(next.current).toBe('p2');
      expect(next.round).toBe(1);
    });
  });

  describe('canAct', () => {
    test('returns true if state is undefined (single-player)', () => {
      expect(mgr.canAct(undefined, 'p1')).toBe(true);
    });

    test('returns true if current is null', () => {
      expect(mgr.canAct(freeformIdle, 'p1')).toBe(true);
    });

    test('returns true if player holds spotlight', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: [] };
      expect(mgr.canAct(state, 'p1')).toBe(true);
    });

    test('returns false if someone else holds it', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p2', queue: [] };
      expect(mgr.canAct(state, 'p1')).toBe(false);
    });
  });

  describe('enterCombat', () => {
    test('sets combat mode with order and round 1', () => {
      const next = mgr.enterCombat(freeformIdle, ['p2', 'p1']);
      expect(next.mode).toBe('combat');
      expect(next.order).toEqual(['p2', 'p1']);
      expect(next.round).toBe(1);
      expect(next.current).toBe('p2');
      expect(next.queue).toEqual([]);
    });

    test('no-op if order empty', () => {
      const next = mgr.enterCombat(freeformIdle, []);
      expect(next).toBe(freeformIdle);
    });
  });

  describe('advanceCombat', () => {
    test('advances to next combatant', () => {
      const state: SpotlightState = { mode: 'combat', current: 'p1', queue: [], order: ['p1', 'p2', 'p3'], round: 1 };
      const next = mgr.advanceCombat(state);
      expect(next.current).toBe('p2');
      expect(next.round).toBe(1);
    });

    test('wraps and increments round at end of order', () => {
      const state: SpotlightState = { mode: 'combat', current: 'p3', queue: [], order: ['p1', 'p2', 'p3'], round: 1 };
      const next = mgr.advanceCombat(state);
      expect(next.current).toBe('p1');
      expect(next.round).toBe(2);
    });

    test('no-op if order is empty', () => {
      const state: SpotlightState = { mode: 'combat', current: null, queue: [], order: [], round: 1 };
      const next = mgr.advanceCombat(state);
      expect(next).toBe(state);
    });

    test('starts from beginning if current not in order', () => {
      const state: SpotlightState = { mode: 'combat', current: 'pX', queue: [], order: ['p1', 'p2'], round: 2 };
      const next = mgr.advanceCombat(state);
      expect(next.current).toBe('p1');
      expect(next.round).toBe(2);
    });
  });

  describe('exitCombat', () => {
    test('returns to freeform with empty queue', () => {
      const state: SpotlightState = { mode: 'combat', current: 'p1', queue: [], order: ['p1', 'p2'], round: 3 };
      const next = mgr.exitCombat(state);
      expect(next.mode).toBe('freeform');
      expect(next.current).toBeNull();
      expect(next.queue).toEqual([]);
    });
  });

  describe('removePlayer', () => {
    test('passes spotlight if holder is removed', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: ['p2'] };
      const next = mgr.removePlayer(state, 'p1');
      expect(next.current).toBe('p2');
      expect(next.queue).toEqual([]);
    });

    test('removes from queue', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: ['p2', 'p3'] };
      const next = mgr.removePlayer(state, 'p2');
      expect(next.current).toBe('p1');
      expect(next.queue).toEqual(['p3']);
    });

    test('spotlight goes null if holder removed with empty queue', () => {
      const state: SpotlightState = { mode: 'freeform', current: 'p1', queue: [] };
      const next = mgr.removePlayer(state, 'p1');
      expect(next.current).toBeNull();
    });
  });
});
