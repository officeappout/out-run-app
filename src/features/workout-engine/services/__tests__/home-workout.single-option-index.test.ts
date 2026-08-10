import { describe, it, expect } from 'vitest';
import { resolveSingleOptionWantIndex, shouldSkipSingleOptionSlot } from '../home-workout.service';
import { resolveSessionPolicy } from '../periodization.service';

/**
 * Deload/Peak fast-path mislabeling bug (10.08.2026): generateHomeWorkoutTrio's
 * generateSingleOption fast path used to gate on `configs[i].difficulty !== 2`,
 * which ALWAYS survives only at i=1 (the only difficulty-2 entry in
 * TRAINING_DAY_CONFIGS) — so the schedule-card-tap preview drawer silently
 * computed the Balanced/D2 config on every date, even when the periodization
 * engine's `sessionPolicy.defaultFocusIndex` recommended Easy(0) on a
 * Deload/Rebuild week or Intense(2) on a Peak week. The fix keys the gate on
 * the actual recommended trio INDEX instead of a hardcoded difficulty value.
 *
 * These tests exercise the exact two functions the production loop in
 * generateHomeWorkoutTrio calls (resolveSingleOptionWantIndex,
 * shouldSkipSingleOptionSlot) — not re-implementations — so a pass here
 * proves the real gate's behaviour without needing to drive the full
 * Firestore-backed pipeline.
 */
describe('resolveSingleOptionWantIndex / shouldSkipSingleOptionSlot — Deload/Peak fast-path fix', () => {
  describe('(a) OLD-bug-shape: a non-default defaultFocusIndex now changes which slot is computed', () => {
    it('Deload week (cycle week 5, no gap) → defaultFocusIndex=0 → the single computed slot ' +
       'is index 0 (Easy/D1), NOT index 1 (Balanced/D2) — this is the exact bug being fixed', () => {
      const policy = resolveSessionPolicy(5, 0);
      expect(policy.defaultFocusIndex).toBe(0); // sanity: this IS a Deload date

      const wantIndex = resolveSingleOptionWantIndex(true, undefined, policy.defaultFocusIndex);
      expect(wantIndex).toBe(0);

      // Index 0 (Easy/D1, the periodization-recommended slot) is COMPUTED.
      expect(shouldSkipSingleOptionSlot(0, true, undefined, wantIndex)).toBe(false);
      // Index 1 (Balanced/D2 — what the OLD hardcoded gate always computed,
      // regardless of the date) is now SKIPPED.
      expect(shouldSkipSingleOptionSlot(1, true, undefined, wantIndex)).toBe(true);
      expect(shouldSkipSingleOptionSlot(2, true, undefined, wantIndex)).toBe(true);
    });

    it('Rebuild policy (21+ day gap) → defaultFocusIndex=0 → same Easy/D1 slot, not D2', () => {
      const policy = resolveSessionPolicy(1, 25); // gap >= rebuild threshold
      expect(policy.defaultFocusIndex).toBe(0);
      expect(policy.reason).toBe('rebuild');

      const wantIndex = resolveSingleOptionWantIndex(true, undefined, policy.defaultFocusIndex);
      expect(wantIndex).toBe(0);
      expect(shouldSkipSingleOptionSlot(1, true, undefined, wantIndex)).toBe(true);
    });

    it('Peak week (cycle week 4, no gap) → defaultFocusIndex=2 → the single computed slot ' +
       'is index 2 (Intense/D3), NOT index 1 (Balanced/D2)', () => {
      const policy = resolveSessionPolicy(4, 0);
      expect(policy.defaultFocusIndex).toBe(2); // sanity: this IS a Peak date

      const wantIndex = resolveSingleOptionWantIndex(true, undefined, policy.defaultFocusIndex);
      expect(wantIndex).toBe(2);

      expect(shouldSkipSingleOptionSlot(2, true, undefined, wantIndex)).toBe(false);
      expect(shouldSkipSingleOptionSlot(1, true, undefined, wantIndex)).toBe(true);
      expect(shouldSkipSingleOptionSlot(0, true, undefined, wantIndex)).toBe(true);
    });

    it('an ordinary build week (defaultFocusIndex=1) still resolves to the middle D2 slot — ' +
       'the default case is unchanged, only non-default dates were broken', () => {
      const policy = resolveSessionPolicy(2, 0); // week 2 = build
      expect(policy.defaultFocusIndex).toBe(1);

      const wantIndex = resolveSingleOptionWantIndex(true, undefined, policy.defaultFocusIndex);
      expect(wantIndex).toBe(1);
      expect(shouldSkipSingleOptionSlot(1, true, undefined, wantIndex)).toBe(false);
      expect(shouldSkipSingleOptionSlot(0, true, undefined, wantIndex)).toBe(true);
      expect(shouldSkipSingleOptionSlot(2, true, undefined, wantIndex)).toBe(true);
    });

    it('explicit targetOptionIndex overrides the periodization recommendation entirely', () => {
      const peakPolicy = resolveSessionPolicy(4, 0);
      expect(peakPolicy.defaultFocusIndex).toBe(2);
      // Caller pins index 0 even though this is a Peak (index-2) date.
      const wantIndex = resolveSingleOptionWantIndex(true, 0, peakPolicy.defaultFocusIndex);
      expect(wantIndex).toBe(0);
    });
  });

  describe('(b) regression-safety: the full-trio (non-single-option) path is provably unaffected', () => {
    it('generateSingleOption=false, no targetDifficulty/targetOptionIndex → no index is ' +
       'skipped by this gate, on a Deload date or otherwise — all 3 slots still compute', () => {
      const wantIndex = resolveSingleOptionWantIndex(false, undefined, 0 /* Deload */);
      expect(wantIndex).toBe(1); // preserves the exact prior bundleId-tracking default

      for (const i of [0, 1, 2] as const) {
        expect(shouldSkipSingleOptionSlot(i, false, undefined, wantIndex)).toBe(false);
      }
    });

    it('generateSingleOption=undefined (the real default — most callers never set it) → same: ' +
       'nothing is skipped by this gate', () => {
      const wantIndex = resolveSingleOptionWantIndex(undefined, undefined, 2 /* Peak */);
      expect(wantIndex).toBe(1);

      for (const i of [0, 1, 2] as const) {
        expect(shouldSkipSingleOptionSlot(i, undefined, undefined, wantIndex)).toBe(false);
      }
    });

    it('Custom Builder path (targetDifficulty set, generateSingleOption never set true in ' +
       'practice) — this gate never fires on its own; the separate targetDifficulty gate ' +
       '(upstream in the loop, unchanged by this fix) is what filters slots there', () => {
      const wantIndex = resolveSingleOptionWantIndex(undefined, undefined, 1);
      expect(shouldSkipSingleOptionSlot(0, undefined, 2, wantIndex)).toBe(false);
      expect(shouldSkipSingleOptionSlot(1, undefined, 2, wantIndex)).toBe(false);
      expect(shouldSkipSingleOptionSlot(2, undefined, 2, wantIndex)).toBe(false);
    });

    it('defensive precedence check: even in the hypothetical case where generateSingleOption ' +
       'AND targetDifficulty were both set, targetDifficulty wins — this gate defers entirely ' +
       'and never skips a slot on its own', () => {
      for (const i of [0, 1, 2] as const) {
        expect(shouldSkipSingleOptionSlot(i, true, 2, 1)).toBe(false);
      }
    });
  });
});
