import { describe, it, expect } from 'vitest';
import { createBudgetDistributor } from '../BudgetDistributor';
import type { WorkoutExercise } from '../../../logic/WorkoutGenerator';
import type { WorkoutGenerationContext } from '../../../logic/workout-generator.types';
import type { BudgetConstraints } from '../pipeline.types';

/**
 * Regression coverage for the skill-aware drop fix (2026-10-07 under-fill
 * investigation, 4th layer). _pyramidAwareCap's "DROP lowest-score
 * exercises" branch (BudgetDistributor.ts, fires when the greedy per-set
 * trim hits the structure floor and the budget still can't afford it for
 * every exercise) used to order survivors by raw `score` alone -- a
 * higher-scoring non-target exercise (e.g. a one_arm_pullup accessory
 * riding the shared 'pull' budget) could drop a lower-scoring
 * planche/front_lever pick the user actually selected. Confirmed live
 * during the investigation: selectExercisesWithDomainQuotas correctly
 * returned multiple front_lever candidates, but this cap dropped them
 * back down to 1 regardless.
 *
 * Uses reapplyCaps (the public entry point that calls the SAME
 * _pyramidAwareCap, with hand-built WorkoutExercise[] already carrying
 * `sets`/`score` directly) rather than distribute() (which would also
 * route through assignVolume's own tier/level logic -- unrelated
 * complexity for what this test is isolating).
 *
 * Writing this test surfaced a SEPARATE, pre-existing bug in the same
 * function: the DROP branch's final merge (`exercises.map(e =>
 * byId.get(e.exercise.id) ?? e)`) fell back to the ORIGINAL, untrimmed
 * exercise object for anything excluded from `finalStraight` -- so nothing
 * was ever actually dropped; excluded exercises silently reappeared at
 * their full pre-greedy `sets` count. Fixed alongside the skill-aware
 * comparator in the same commit, since the comparator is inert without it
 * (there is nothing to "order the drop" of if the drop never happens).
 */

function makeWorkoutExercise(
  id: string,
  score: number,
  sets: number,
  targetPrograms: Array<{ programId: string; level: number }> = [],
): WorkoutExercise {
  return {
    exercise: { id, name: { he: id, en: id }, targetPrograms } as any,
    method: { location: 'park' } as any,
    mechanicalType: 'bent_arm',
    sets,
    reps: 10,
    isTimeBased: false,
    restSeconds: 90,
    priority: 'skill',
    score,
    reasoning: [],
    exerciseRole: 'main',
  } as any;
}

function ctx(selectedSkillIds: string[]): WorkoutGenerationContext {
  return { availableTime: 30, intentMode: undefined, selectedSkillIds } as any;
}

const TIGHT_CAP: BudgetConstraints = {
  maxSets: 5,
  isSingleDomain: false,
  exerciseSlotCount: 5,
};

describe('BudgetDistributor._pyramidAwareCap — skill-aware drop', () => {
  it('a target-skill exercise survives the drop even when it scores lower than non-target exercises', () => {
    // 2 target-skill (low score) + 3 generic/other-skill (high score), all
    // starting at 4 sets -- forces the greedy trim to hit the structure
    // floor (2) at 10 total sets, still over the cap of 5, so the DROP
    // branch fires and must choose 2 of 5 to keep (floor(5/2)=2).
    const planche = makeWorkoutExercise('planche-1', 10, 4, [{ programId: 'planche', level: 14 }]);
    const frontLever = makeWorkoutExercise('front-1', 20, 4, [{ programId: 'front_lever', level: 7 }]);
    const generic1 = makeWorkoutExercise('generic-1', 90, 4, [{ programId: 'one_arm_pullup', level: 5 }]);
    const generic2 = makeWorkoutExercise('generic-2', 80, 4, [{ programId: 'pull', level: 16 }]);
    const generic3 = makeWorkoutExercise('generic-3', 70, 4, [{ programId: 'pull', level: 16 }]);

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps(
      [planche, frontLever, generic1, generic2, generic3],
      TIGHT_CAP,
      ctx(['planche', 'front_lever']),
    );

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds).toContain('planche-1');
    expect(survivingIds).toContain('front-1');
    expect(survivingIds).not.toContain('generic-1');
  });

  it('without a target-skill selection, falls back to the original pure-score drop order (no regression)', () => {
    // ctx([]) (not an omitted context) is required here: reapplyCaps treats
    // a MISSING context as its own "legacy safety net" (structureFloor=1,
    // uniform thinning via applySmartSetCap, no dropping at all) -- that's a
    // real, separate code path, not this DROP branch. An empty
    // selectedSkillIds with a normal availableTime is what actually exercises
    // the DROP branch's pure-score fallback this test is named for.
    const low1 = makeWorkoutExercise('low-1', 10, 4);
    const low2 = makeWorkoutExercise('low-2', 20, 4);
    const high1 = makeWorkoutExercise('high-1', 90, 4);
    const high2 = makeWorkoutExercise('high-2', 80, 4);
    const high3 = makeWorkoutExercise('high-3', 70, 4);

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps([low1, low2, high1, high2, high3], TIGHT_CAP, ctx([]));

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds).toContain('high-1');
    expect(survivingIds).toContain('high-2');
    expect(survivingIds).not.toContain('low-1');
    expect(survivingIds).not.toContain('low-2');
    expect(survivingIds).not.toContain('high-3'); // keep=floor(5/2)=2 -- only the top 2 survive
  });

  it('a target-skill selection that matches nothing in the pool changes nothing (same pure-score order)', () => {
    const low1 = makeWorkoutExercise('low-1', 10, 4);
    const low2 = makeWorkoutExercise('low-2', 20, 4);
    const high1 = makeWorkoutExercise('high-1', 90, 4);
    const high2 = makeWorkoutExercise('high-2', 80, 4);
    const high3 = makeWorkoutExercise('high-3', 70, 4);

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps(
      [low1, low2, high1, high2, high3],
      TIGHT_CAP,
      ctx(['planche', 'front_lever']), // none of these exercises are tagged with either
    );

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds).toContain('high-1');
    expect(survivingIds).toContain('high-2');
  });

  it('the ≤4-sets-per-exercise skill cap (a different function entirely) is untouched by this fix', () => {
    // Sanity check only -- confirms this test file's fixtures don't
    // accidentally exercise workout-budgeting.utils.ts's assignVolume at
    // all (reapplyCaps never calls it), so there is nothing here that
    // could interact with that separate, intentionally-unchanged cap.
    const planche = makeWorkoutExercise('planche-1', 10, 4, [{ programId: 'planche', level: 14 }]);
    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps([planche], { maxSets: 10, isSingleDomain: true, exerciseSlotCount: 1 }, ctx(['planche']));
    expect(result[0].sets).toBe(4); // untouched -- well under the cap, nothing to trim
  });
});
