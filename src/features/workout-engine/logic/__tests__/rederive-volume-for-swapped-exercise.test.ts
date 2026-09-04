import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rederiveVolumeForSwappedExercise } from '../workout-budgeting.utils';
import { TIER_TABLE } from '../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Regression tests for the shared exercise-swap volume re-derivation
 * function (docs/workout-engine/03-CHANGES.md, Addendum 3): every
 * exercise-swap path (applyFlowRegression, substituteExercise,
 * applyEssentialGearFilter's naked-backfill/violation-replacement)
 * independently carried the REPLACED exercise's reps/hold value forward
 * regardless of the new exercise's type or tier — most severely, a hold
 * exercise's assigned duration in seconds surviving unchanged and getting
 * displayed/stored as a rep count once swapped to a rep-based exercise.
 *
 * rederiveVolumeForSwappedExercise fixes this BY CONSTRUCTION: its
 * signature takes only the NEW exercise + its level_diff + tier context —
 * it never receives the old/replaced exercise's reps or hold value at all,
 * so there is nothing for it to accidentally inherit.
 */

const holdExercise = (id: string): Exercise =>
  ({
    id,
    name: { he: 'החזקת מקבילים', en: id },
    type: 'time',
    mechanicalType: 'straight_arm',
    movementGroup: 'vertical_push',
    symmetry: 'bilateral',
    tags: [],
  } as never);

const repExercise = (id: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    type: 'reps',
    mechanicalType: 'bent_arm',
    movementGroup: 'vertical_push',
    symmetry: 'bilateral',
    tags: [],
  } as never);

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('rederiveVolumeForSwappedExercise', () => {
  it('hold → reps: a rep-based new exercise never gets a hold-duration value like 15 treated as a rep count', () => {
    // The exact bug scenario: the OLD exercise was a 15s hold at elite/hard
    // tier (calculateHoldTimeTier's 15s cap). The new exercise is rep-based
    // at the SAME above-level tier. Because this function only ever looks
    // at newExercise + levelDelta, it cannot inherit the old 15s value.
    for (let i = 0; i < 20; i++) {
      const derived = rederiveVolumeForSwappedExercise(repExercise('reps_ex'), 2, 1); // delta=2 → elite
      expect(derived.isTimeBased).toBe(false);
      expect(derived.reps).toBeGreaterThanOrEqual(TIER_TABLE.elite.reps.min);
      expect(derived.reps).toBeLessThanOrEqual(TIER_TABLE.elite.reps.max); // 1-3, never 15
    }
  });

  it('reps → hold: a time-based new exercise gets a hold duration, not a leftover rep count', () => {
    for (let i = 0; i < 20; i++) {
      const derived = rederiveVolumeForSwappedExercise(holdExercise('hold_ex'), 2, 1); // delta=2 → elite
      expect(derived.isTimeBased).toBe(true);
      // elite/hard tier hold is capped at 15s by calculateHoldTimeTier.
      expect(derived.reps).toBeGreaterThanOrEqual(3);
      expect(derived.reps).toBeLessThanOrEqual(15);
    }
  });

  it('a swap that changes level_diff re-derives BOTH the tier and the reps range, not just isTimeBased', () => {
    const ex = repExercise('same_ex');
    for (let i = 0; i < 15; i++) {
      const atLevel = rederiveVolumeForSwappedExercise(ex, 0, 2); // delta=0 → match
      expect(atLevel.tier).toBe('match');
      expect(atLevel.reps).toBeGreaterThanOrEqual(2);
      expect(atLevel.reps).toBeLessThanOrEqual(4); // DAVID STAIRCASE match <50% range
    }
    for (let i = 0; i < 15; i++) {
      const aboveLevel = rederiveVolumeForSwappedExercise(ex, 2, 2); // same exercise, delta=2 → elite
      expect(aboveLevel.tier).toBe('elite');
      expect(aboveLevel.reps).toBeGreaterThanOrEqual(1);
      expect(aboveLevel.reps).toBeLessThanOrEqual(3); // TIER_TABLE elite, not match's 2-4
    }
  });

  it('restSeconds is re-derived from the new tier, not left at whatever the old exercise had', () => {
    const matchRest = rederiveVolumeForSwappedExercise(repExercise('r1'), 0, 2);
    const eliteRest = rederiveVolumeForSwappedExercise(repExercise('r2'), 2, 2);
    expect(matchRest.restSeconds).toBeGreaterThanOrEqual(TIER_TABLE.match.rest.min);
    expect(matchRest.restSeconds).toBeLessThanOrEqual(TIER_TABLE.match.rest.max * 1.01); // rounding slack
    expect(eliteRest.restSeconds).toBeGreaterThanOrEqual(TIER_TABLE.elite.rest.min);
  });

  it('match/easy/flow tiers still route through the DAVID STAIRCASE (levelProgressPercent-aware), untouched by this function\'s hard/elite handling', () => {
    const ex = repExercise('staircase_ex');
    for (let i = 0; i < 15; i++) {
      const lowProgress = rederiveVolumeForSwappedExercise(ex, 0, 2, 10); // match, <50%
      expect(lowProgress.reps).toBeGreaterThanOrEqual(2);
      expect(lowProgress.reps).toBeLessThanOrEqual(4);
    }
    for (let i = 0; i < 15; i++) {
      const highProgress = rederiveVolumeForSwappedExercise(ex, 0, 2, 80); // match, >=50%
      expect(highProgress.reps).toBeGreaterThanOrEqual(4);
      expect(highProgress.reps).toBeLessThanOrEqual(6);
    }
  });
});
