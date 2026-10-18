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

function ctx(selectedSkillIds: string[], requiredDomains?: string[]): WorkoutGenerationContext {
  return { availableTime: 30, intentMode: undefined, selectedSkillIds, requiredDomains } as any;
}

const TIGHT_CAP: BudgetConstraints = {
  maxSets: 5,
  isSingleDomain: false,
  exerciseSlotCount: 5,
};

describe('BudgetDistributor._pyramidAwareCap — skill-aware drop', () => {
  // Generator QA round 1 (2026-10-18): the DROP branch now keeps at least
  // minMainExercisesFor(availableTime) exercises (30 min → 4), so these fixtures carry
  // 7 candidates — the drop still has to choose (4 of 7) and #184's ordering is what
  // decides which survive.
  it('a target-skill exercise survives the drop even when it scores lower than non-target exercises', () => {
    // 2 target-skill (low score) + 5 generic/other-skill (high score), all at
    // 4 sets -- the greedy trim hits the structure floor (2) at 14 sets, still
    // over the cap of 5, so the DROP branch fires and keeps
    // max(floor(5/2)=2, variety floor 4) = 4 of 7.
    const planche = makeWorkoutExercise('planche-1', 10, 4, [{ programId: 'planche', level: 14 }]);
    const frontLever = makeWorkoutExercise('front-1', 20, 4, [{ programId: 'front_lever', level: 7 }]);
    const generics = [90, 80, 70, 60, 50].map((score, i) =>
      makeWorkoutExercise(`generic-${i + 1}`, score, 4, [{ programId: i === 0 ? 'one_arm_pullup' : 'pull', level: 16 }]));

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps(
      [planche, frontLever, ...generics],
      TIGHT_CAP,
      ctx(['planche', 'front_lever']),
    );

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds).toHaveLength(4);
    expect(survivingIds).toContain('planche-1');
    expect(survivingIds).toContain('front-1');
    expect(survivingIds).toEqual(expect.arrayContaining(['generic-1', 'generic-2']));
    expect(survivingIds).not.toContain('generic-3');
    expect(survivingIds).not.toContain('generic-5');
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
    const highs = [90, 80, 70, 60, 50].map((score, i) => makeWorkoutExercise(`high-${i + 1}`, score, 4));

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps([low1, low2, ...highs], TIGHT_CAP, ctx([]));

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds).toEqual(['high-1', 'high-2', 'high-3', 'high-4']); // keep=4 (30-min floor) -- the top 4 by score
    // #184's other half: a dropped exercise never comes back at its untrimmed sets,
    // and survivors are pinned to the structure floor (2) -- the drop is real.
    expect(result.every((e) => e.sets === 2)).toBe(true);
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

  it('domain-balance audit (11.10.2026): a required domain survives the DROP even when all its candidates score lower than another required domain\'s', () => {
    // 2 legs (low score) + 3 push (high score), all at 4 sets -- same
    // "greedy hits the floor, still over cap" shape as the skill-aware
    // test above, but here NOTHING is a user-selected skill (selectedSkillIds
    // is empty) -- the only thing protecting legs is requiredDomains. Before
    // this fix, legs would have been dropped entirely (pure score order),
    // which is exactly the live legs+push starvation this fix closes.
    const legs1 = makeWorkoutExercise('legs-1', 30, 4, [{ programId: 'legs', level: 10 }]);
    const legs2 = makeWorkoutExercise('legs-2', 25, 4, [{ programId: 'legs', level: 10 }]);
    const push1 = makeWorkoutExercise('push-1', 90, 4, [{ programId: 'push', level: 15 }]);
    const push2 = makeWorkoutExercise('push-2', 80, 4, [{ programId: 'push', level: 15 }]);
    const push3 = makeWorkoutExercise('push-3', 70, 4, [{ programId: 'push', level: 15 }]);

    const distributor = createBudgetDistributor();
    const result = distributor.reapplyCaps(
      [legs1, legs2, push1, push2, push3],
      TIGHT_CAP,
      ctx([], ['legs', 'push']),
    );

    const survivingIds = result.map((e) => e.exercise.id);
    expect(survivingIds.some((id) => id.startsWith('legs-'))).toBe(true);
    expect(survivingIds.some((id) => id.startsWith('push-'))).toBe(true);
    expect(survivingIds).not.toContain('legs-2'); // keep=4 of 5 -- the worst-scoring pick (legs-2) is the one dropped
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

  describe('variety floor (H3, generator QA round 1)', () => {
    const at = (availableTime: number): WorkoutGenerationContext =>
      ({ availableTime, intentMode: undefined, selectedSkillIds: [] }) as any;
    const six = () => [90, 80, 70, 60, 50, 40].map((score, i) => makeWorkoutExercise(`ex-${i + 1}`, score, 4));

    it('a tight budget keeps the duration minimum (30 min → 4) at the 2-set floor instead of 2 exercises', () => {
      const result = createBudgetDistributor().reapplyCaps(six(), { dailySetBudget: 4, isSingleDomain: false, exerciseSlotCount: 6 }, at(30));
      expect(result.map((e) => e.exercise.id)).toEqual(['ex-1', 'ex-2', 'ex-3', 'ex-4']);
      expect(result.every((e) => e.sets === 2)).toBe(true); // 8 sets: bounded overage (min × floor), not 4 × 4
    });

    it('45 min → 5, 60 min → 6', () => {
      expect(createBudgetDistributor().reapplyCaps(six(), { dailySetBudget: 4, isSingleDomain: false, exerciseSlotCount: 6 }, at(45))).toHaveLength(5);
      expect(createBudgetDistributor().reapplyCaps(six(), { dailySetBudget: 4, isSingleDomain: false, exerciseSlotCount: 6 }, at(60))).toHaveLength(6);
    });

    it('a budget that affords more than the floor still decides (no inflation above it)', () => {
      // 12 sets / 2 = 6 affordable > floor 4 -- the budget, not the floor, sets the count.
      const result = createBudgetDistributor().reapplyCaps(six(), { dailySetBudget: 12, isSingleDomain: false, exerciseSlotCount: 6 }, at(30));
      expect(result).toHaveLength(6);
      expect(result.reduce((s, e) => s + e.sets, 0)).toBe(12);
    });
  });
});
