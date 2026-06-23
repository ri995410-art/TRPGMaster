import { SafetyManager } from '../../core/SafetyManager';
import type { SafetyState } from '@trpgmaster/shared';

const defaultS0: SafetyState = { phase: 's0', lines: [], veils: [], toneFlags: [], xcardActive: false };
const defaultPlay: SafetyState = { phase: 'play', lines: [], veils: [], toneFlags: [], xcardActive: false };

describe('SafetyManager', () => {
  let mgr: SafetyManager;
  beforeEach(() => { mgr = new SafetyManager(); });

  describe('canPlay', () => {
    test('returns true if safety is undefined (single-player)', () => {
      expect(mgr.canPlay(undefined)).toBe(true);
    });

    test('returns false during S0 phase', () => {
      expect(mgr.canPlay(defaultS0)).toBe(false);
    });

    test('returns true in play phase without X-Card', () => {
      expect(mgr.canPlay(defaultPlay)).toBe(true);
    });

    test('returns false when X-Card active', () => {
      const state: SafetyState = { ...defaultPlay, xcardActive: true };
      expect(mgr.canPlay(state)).toBe(false);
    });
  });

  describe('submitLinesVeils', () => {
    test('merges new lines into existing', () => {
      const state: SafetyState = { ...defaultS0, lines: ['violence'] };
      const next = mgr.submitLinesVeils(state, 'p1', ['gore'], ['body horror'], []);
      expect(next.lines).toContain('violence');
      expect(next.lines).toContain('gore');
      expect(next.veils).toContain('body horror');
    });

    test('deduplicates', () => {
      const state: SafetyState = { ...defaultS0, lines: ['violence'] };
      const next = mgr.submitLinesVeils(state, 'p1', ['violence'], [], []);
      expect(next.lines).toEqual(['violence']);
    });

    test('merges toneFlags', () => {
      const state: SafetyState = { ...defaultS0, toneFlags: ['serious'] };
      const next = mgr.submitLinesVeils(state, 'p1', [], [], ['humor']);
      expect(next.toneFlags).toContain('serious');
      expect(next.toneFlags).toContain('humor');
    });

    test('does not mutate original', () => {
      const state: SafetyState = { ...defaultS0, lines: ['a'] };
      const next = mgr.submitLinesVeils(state, 'p1', ['b'], [], []);
      expect(state.lines).toEqual(['a']);
      expect(next.lines).toEqual(['a', 'b']);
    });
  });

  describe('completeS0', () => {
    test('transitions phase from s0 to play', () => {
      const next = mgr.completeS0(defaultS0);
      expect(next.phase).toBe('play');
    });

    test('preserves lines/veils', () => {
      const state: SafetyState = { ...defaultS0, lines: ['x'], veils: ['y'] };
      const next = mgr.completeS0(state);
      expect(next.lines).toEqual(['x']);
      expect(next.veils).toEqual(['y']);
    });
  });

  describe('activateXCard', () => {
    test('sets xcardActive to true', () => {
      const next = mgr.activateXCard(defaultPlay);
      expect(next.xcardActive).toBe(true);
    });
  });

  describe('deactivateXCard', () => {
    test('sets xcardActive to false', () => {
      const state: SafetyState = { ...defaultPlay, xcardActive: true };
      const next = mgr.deactivateXCard(state);
      expect(next.xcardActive).toBe(false);
    });
  });

  describe('isPaused', () => {
    test('returns false if safety undefined', () => {
      expect(mgr.isPaused(undefined)).toBe(false);
    });

    test('returns true when X-Card active', () => {
      const state: SafetyState = { ...defaultPlay, xcardActive: true };
      expect(mgr.isPaused(state)).toBe(true);
    });

    test('returns false when X-Card not active', () => {
      expect(mgr.isPaused(defaultPlay)).toBe(false);
    });
  });
});
