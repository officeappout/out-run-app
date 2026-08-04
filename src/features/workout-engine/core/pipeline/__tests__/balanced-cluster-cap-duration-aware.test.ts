import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBudgetDistributor } from '../BudgetDistributor';
import { getWorkoutContext } from '../../../services/split-decision/SplitDecisionService';
import type { WorkoutGenerationContext } from '../../../logic/workout-generator.types';
import type { BudgetConstraints } from '../pipeline.types';

/**
 * fix/balanced-cluster-cap-duration-aware — verification suite
 * ────────────────────────────────────────────────────────────────────────
 * Option 1 from the approved investigation: `_balancedClusterCap` (D2 only)
 * now also unlocks the 4-exercise ceiling when `context.availableTime >= 45`,
 * mirroring the existing diversity release — WITHOUT raising
 * BALANCED_CLUSTER_MAX_SETS (the D2 per-exercise ceiling, untouched) and
 * WITHOUT touching `_skillClusterCap` (D3, untouched — deferred bug).
 *
 * These tests run the REAL `BudgetDistributor.distribute()` pipeline
 * (assignVolume → caps → rebalance → cluster cap) end-to-end, and the REAL
 * `SplitDecisionService.getWorkoutContext()` to source `dailySetBudget` from
 * both the Custom Builder (isManualOverride) branch and the regular/
 * scheduled (deficit-aware) branch — no fabricated numbers.
 *
 * Math.random is pinned to 0 so `assignVolume`'s randomized set/rep ranges
 * resolve to their deterministic minimum, keeping exercise-count assertions
 * (the thing under test) stable across runs. This does not change which
 * code path fires — only which point in an already-open random range is
 * sampled.
 */

// A narrow, single-domain main pool (all `vertical_pull` → domain 'pull'),
// so `isDiverse` is always false and the ONLY lever that can unlock the
// 4-exercise ceiling is the new duration check.
const mainExercise = (id: string, score: number) => ({
  exercise: {
    id,
    name: { he: id, en: id },
    movementGroup: 'vertical_pull',
    secondsPerRep: 3,
    symmetry: 'bilateral',
    tags: [],
  },
  method: 'bodyweight',
  mechanicalType: 'pull',
  score,
  reasoning: [],
} as never);

const mainExerciseMg = (id: string, score: number, movementGroup: string) => ({
  exercise: {
    id,
    name: { he: id, en: id },
    movementGroup,
    secondsPerRep: 3,
    symmetry: 'bilateral',
    tags: [],
  },
  method: 'bodyweight',
  mechanicalType: 'pull',
  score,
  reasoning: [],
} as never);

const pool8 = () =>
  Array.from({ length: 8 }, (_, i) => mainExercise(`pull_${i}`, 90 - i));

const baseContext = (overrides: Partial<WorkoutGenerationContext>): WorkoutGenerationContext =>
  ({
    availableTime: 60,
    userLevel: 10,
    daysInactive: 0,
    intentMode: 'standard',
    persona: null,
    location: 'park',
    injuryCount: 0,
    ...overrides,
  } as WorkoutGenerationContext);

const mainsOf = <T extends { exerciseRole?: string }>(exercises: T[]): T[] =>
  exercises.filter((e) => (e.exerciseRole ?? 'main') === 'main');

const totalSets = (exercises: Array<{ sets: number }>) =>
  exercises.reduce((s, e) => s + e.sets, 0);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('BudgetDistributor — _balancedClusterCap duration-aware release (D2)', () => {
  it('SCENARIO 1 — Custom Builder (isManualOverride) D2 60min: exercise count rises above the old 3-exercise ceiling', () => {
    // Real dailySetBudget from the REAL manual-override branch of
    // SplitDecisionService.getWorkoutContext() (SplitDecisionService.ts ~450-472).
    const userProfile = {
      lifestyle: { scheduleDays: ['mon', 'wed'] }, // scheduleDaysForBudget = 2
      progression: {},
    } as never;
    const split = getWorkoutContext({ userProfile, isManualOverride: true });
    const dailySetBudget = split.dailySetBudget;
    // userLevel=1 (empty progression) → calculateWeeklyBudget(1,2) = max(4, 1*2) = 4
    // rawDaily = ceil(4/2) = 2 → MANUAL_BASELINE_SETS floor (14) wins.
    expect(dailySetBudget).toBe(14);

    const distributor = createBudgetDistributor();
    const constraints: BudgetConstraints = {
      dailySetBudget,
      isSingleDomain: true,
      exerciseSlotCount: 8,
    };

    // OLD behaviour, still verified as a live regression case: <45min stays
    // capped at 3 main exercises regardless of Custom Builder budget.
    const shortResult = distributor.distribute(
      pool8(), baseContext({ availableTime: 30 }), 2, constraints,
    );
    expect(mainsOf(shortResult.exercises).length).toBe(3);

    // NEW behaviour: same Custom Builder budget, 60min → 4 main exercises.
    const longResult = distributor.distribute(
      pool8(), baseContext({ availableTime: 60 }), 2, constraints,
    );
    expect(mainsOf(longResult.exercises).length).toBe(4);

    // eslint-disable-next-line no-console
    console.info(
      `[VERIFY] Custom Builder D2 60min (dailySetBudget=${dailySetBudget}): ` +
      `old(<45min)=${mainsOf(shortResult.exercises).length} main / ${totalSets(mainsOf(shortResult.exercises))} sets` +
      ` → new(>=45min)=${mainsOf(longResult.exercises).length} main / ${totalSets(mainsOf(longResult.exercises))} sets`,
    );
  });

  it('SCENARIO 2 — Regular/scheduled path (isManualOverride=false, deficit-aware) D2 60min: exercise count also rises', () => {
    // Real dailySetBudget from the REAL non-manual branch (SplitDecisionService.ts ~473-505).
    // A generous weekly budget with no completions yet this week.
    const userProfile = {
      lifestyle: { scheduleDays: ['mon', 'wed'] },
      progression: {
        tracks: { pull: { level: 28 } },
      },
    } as never;
    const split = getWorkoutContext({ userProfile, isManualOverride: false });
    const dailySetBudget = split.dailySetBudget;
    // userLevel=28 → calculateWeeklyBudget(28,2) = max(4, 56) = 56.
    // effectiveDays = scheduleDaysForBudget = 2 (no remainingScheduleDays passed).
    // remainingSets = 56 - 0 = 56 → dailySetBudget = max(2, ceil(56/2)) = 28.
    expect(dailySetBudget).toBe(28);

    const distributor = createBudgetDistributor();
    const constraints: BudgetConstraints = {
      dailySetBudget,
      isSingleDomain: true,
      exerciseSlotCount: 8,
    };

    const shortResult = distributor.distribute(
      pool8(), baseContext({ availableTime: 30, userLevel: 28 }), 2, constraints,
    );
    expect(mainsOf(shortResult.exercises).length).toBe(3);

    const longResult = distributor.distribute(
      pool8(), baseContext({ availableTime: 60, userLevel: 28 }), 2, constraints,
    );
    expect(mainsOf(longResult.exercises).length).toBe(4);

    console.info(
      `[VERIFY] Regular/scheduled D2 60min (dailySetBudget=${dailySetBudget}): ` +
      `old(<45min)=${mainsOf(shortResult.exercises).length} main / ${totalSets(mainsOf(shortResult.exercises))} sets` +
      ` → new(>=45min)=${mainsOf(longResult.exercises).length} main / ${totalSets(mainsOf(longResult.exercises))} sets`,
    );
  });

  it('SCENARIO 2b — Regular path throttles under a near-exhausted weekly budget while Custom Builder bypasses it (proves the two dailySetBudget branches are genuinely different, both still duration-aware)', () => {
    const userProfile = {
      lifestyle: { scheduleDays: ['mon', 'wed'] }, // scheduleDaysForBudget = 2
      progression: { tracks: { pull: { level: 28 } } }, // userLevel = 28 → weeklyBudget = 56
    } as never;

    const regular = getWorkoutContext({
      userProfile,
      isManualOverride: false,
      domainSetsCompletedThisWeek: { pull: 30 }, // already did 30/56 sets this week
      remainingScheduleDays: 1, // only 1 day left
    });
    // remainingSets = max(0, 56-30) = 26 → dailySetBudget = max(2, ceil(26/1)) = 26
    expect(regular.dailySetBudget).toBe(26);

    const manual = getWorkoutContext({
      userProfile,
      isManualOverride: true,
      domainSetsCompletedThisWeek: { pull: 30 }, // ignored by the manual-override bypass
      remainingScheduleDays: 1,
    });
    // rawDaily = ceil(56/2) = 28 (uses scheduleDaysForBudget, ignores remainingScheduleDays/completions)
    expect(manual.dailySetBudget).toBe(28);

    console.info(`[VERIFY] deficit-throttled regular=${regular.dailySetBudget} vs bypass manual=${manual.dailySetBudget}`);
  });

  it('REGRESSION — D2, duration <45min: unchanged, still capped at the old 3-exercise baseline (diversity still governs alone)', () => {
    const distributor = createBudgetDistributor();
    const constraints: BudgetConstraints = { dailySetBudget: 20, isSingleDomain: true, exerciseSlotCount: 8 };
    const result = distributor.distribute(pool8(), baseContext({ availableTime: 44 }), 2, constraints);
    expect(mainsOf(result.exercises).length).toBe(3);
  });

  it('REGRESSION — D2, duration <45min, but diverse (>=3 domains): still 4 via the pre-existing diversity rule, unaffected by this fix', () => {
    const distributor = createBudgetDistributor();
    const diversePool = [
      mainExerciseMg('pull_a', 90, 'vertical_pull'),
      mainExerciseMg('push_a', 89, 'vertical_push'),
      mainExerciseMg('legs_a', 88, 'squat'),
      mainExerciseMg('pull_b', 87, 'vertical_pull'),
      mainExerciseMg('pull_c', 86, 'vertical_pull'),
    ] as never;
    const constraints: BudgetConstraints = { dailySetBudget: 20, isSingleDomain: false, exerciseSlotCount: 5 };
    const result = distributor.distribute(diversePool, baseContext({ availableTime: 30 }), 2, constraints);
    expect(mainsOf(result.exercises).length).toBe(4);
  });

  it('REGRESSION — D3 is completely unaffected (skill cluster cap, not balanced cluster cap, and untouched by this diff)', () => {
    const distributor = createBudgetDistributor();
    const constraints: BudgetConstraints = { dailySetBudget: 28, isSingleDomain: true, exerciseSlotCount: 8 };
    // D3 skill-cluster only fires for skill/strength sessions (priority1SkillIds or single-domain);
    // isSingleDomain=true here satisfies that gate so we exercise the real _skillClusterCap path.
    const before = distributor.distribute(pool8(), baseContext({ availableTime: 30 }), 3, constraints);
    const after = distributor.distribute(pool8(), baseContext({ availableTime: 60 }), 3, constraints);
    // SKILL_CLUSTER_MAX_MAIN = 4, identical regardless of availableTime — this diff never
    // touched _skillClusterCap or its constants.
    expect(mainsOf(before.exercises).length).toBe(4);
    expect(mainsOf(after.exercises).length).toBe(4);
  });
});
