import { describe, it, expect } from 'vitest';
import { substituteExercise } from '../WorkoutGenerator';
import { TIER_TABLE } from '../workout-generator.types';
import type { WorkoutExercise } from '../WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Regression tests for substituteExercise (docs/workout-engine/03-CHANGES.md,
 * Addendum 3) — used by GuaranteePassRunner's guarantee/rescue substitutions
 * (4 call sites) and WorkoutGenerator's own David Rule rescue swap. Used to
 * reset reps to a generic default only when isTimeBased flipped, and
 * otherwise inherit `target`'s reps regardless of the new exercise's tier —
 * now routes through rederiveVolumeForSwappedExercise for all of that.
 */

const staleTarget = (reps: number, isTimeBased: boolean): WorkoutExercise =>
  ({
    exercise: { id: 'old_ex', name: { he: 'old', en: 'old' } } as Exercise,
    method: {},
    mechanicalType: 'bent_arm',
    sets: 3,
    reps,
    repsRange: { min: reps, max: reps },
    restSeconds: 60,
    isTimeBased,
    exerciseRole: 'main',
    score: 50,
    reasoning: [],
  } as never);

const holdEx = (id: string): Exercise =>
  ({ id, name: { he: 'החזקה', en: id }, type: 'time', mechanicalType: 'straight_arm', movementGroup: 'vertical_push', symmetry: 'bilateral', tags: [] } as never);

const repEx = (id: string): Exercise =>
  ({ id, name: { he: id, en: id }, type: 'reps', mechanicalType: 'bent_arm', movementGroup: 'vertical_push', symmetry: 'bilateral', tags: [] } as never);

describe('substituteExercise — volume re-derivation', () => {
  it('target was a 15s hold (elite tier); new exercise is rep-based → reps re-derived, not inherited as 15', () => {
    const target = staleTarget(15, true); // the exact bug shape: 15 meaning SECONDS
    for (let i = 0; i < 20; i++) {
      const result = substituteExercise(target, repEx('new_reps'), undefined, 2, 1); // delta=2 → elite
      expect(result.isTimeBased).toBe(false);
      expect(result.tier).toBe('elite'); // caller can now keep levelDelta/programLevel in sync too
      expect(result.reps).toBeGreaterThanOrEqual(TIER_TABLE.elite.reps.min);
      expect(result.reps).toBeLessThanOrEqual(TIER_TABLE.elite.reps.max); // 1-3, never 15
    }
  });

  it('target was rep-based (reps=10); new exercise is a hold → reps re-derived as a hold duration', () => {
    const target = staleTarget(10, false);
    for (let i = 0; i < 20; i++) {
      const result = substituteExercise(target, holdEx('new_hold'), undefined, 2, 1);
      expect(result.isTimeBased).toBe(true);
      expect(result.reps).toBeGreaterThanOrEqual(3);
      expect(result.reps).toBeLessThanOrEqual(15); // elite/hard hold cap, not the inherited 10
    }
  });

  it('same-type swap (reps → reps) that changes level_diff also updates reps, not just when type flips', () => {
    const target = staleTarget(4, false); // was match-tier reps
    for (let i = 0; i < 15; i++) {
      // Above-level swap: reps must NOT stay at the old match-tier value.
      const result = substituteExercise(target, repEx('harder_ex'), undefined, 2, 1);
      expect(result.reps).toBeGreaterThanOrEqual(1);
      expect(result.reps).toBeLessThanOrEqual(3);
    }
  });

  it('restSeconds is re-derived for the new tier, not inherited from target', () => {
    const target = { ...staleTarget(10, false), restSeconds: 9999 };
    const result = substituteExercise(target, repEx('r'), undefined, 2, 1);
    expect(result.restSeconds).toBeLessThan(9999);
    expect(result.restSeconds).toBeGreaterThanOrEqual(TIER_TABLE.elite.rest.min);
  });

  it('Skill-Rep Guard: unilateral push/pull candidate still gets the fixed 1-3 range regardless of tier (pre-existing behavior preserved)', () => {
    const target = staleTarget(10, false);
    const unilateral = { ...repEx('uni'), symmetry: 'unilateral', movementGroup: 'vertical_pull' } as Exercise;
    for (let i = 0; i < 10; i++) {
      const result = substituteExercise(target, unilateral, undefined, 0, 2); // delta=0, would normally be match (2-4)
      expect(result.reps).toBeGreaterThanOrEqual(1);
      expect(result.reps).toBeLessThanOrEqual(3); // Skill-Rep Guard override, not match's 2-4
    }
  });
});
