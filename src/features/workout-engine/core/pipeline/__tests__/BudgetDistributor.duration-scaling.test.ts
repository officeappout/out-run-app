import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BudgetDistributor } from '../BudgetDistributor';
import { assignVolume, calculateVolumeAdjustment, calculateEstimatedDuration } from '../../../logic/workout-budgeting.utils';
import type { WorkoutGenerationContext } from '../../../logic/workout-generator.types';
import type { BudgetConstraints } from '../pipeline.types';

/**
 * Fix 1 downstream trace (03.08.2026) — required by the task spec:
 * "verify workout-budgeting.utils.ts around lines 514-533 ... does not
 * silently swallow this increase back down."
 *
 * Finding: lines ~486-550 of workout-budgeting.utils.ts (the domain-aware
 * budget consolidation, including the exact `budgetCap` logic at ~509-533)
 * are gated by `hasDomainBudgets = (context.domainBudgets?.length ?? 0) > 0`
 * (line 482). The single-track / non-master Custom Builder path — the ONLY
 * consumer of the isManualOverride branch this fix touches — never sets
 * `context.domainBudgets` (confirmed: home-workout.service.ts's single-track
 * branch, ~1472-1488, builds `splitContext` via getWorkoutContext but never
 * populates `resolvedDomainBudgets` for that branch — only the master-program
 * branches at ~1331/1354/1428 do). So for this fix's target path, the
 * domain-consolidation block is SKIPPED entirely and cannot claw back the
 * duration-scaled dailySetBudget.
 *
 * Instead, the value flows through the plain (non-domain) ceiling at
 * lines ~552-563 (`setsPerSlot = floor(dailySetBudget / exerciseCount)`)
 * and BudgetDistributor's Step 5g rebalance (BudgetDistributor.ts:243-292),
 * both proven below to scale up, not clamp down, as dailySetBudget grows.
 */

function scoredEx(id: string) {
  return {
    exercise: { id, name: { he: id }, movementGroup: 'horizontal_push', symmetry: 'bilateral', secondsPerRep: 3 },
    method: { requiredGearType: 'none' },
    score: 50,
    reasoning: [],
    mechanicalType: 'compound',
    levelDiff: 0, // resolveTier(0) = 'match'
  } as never;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('assignVolume — domain-consolidation gate (workout-budgeting.utils.ts ~482-550) does not fire without domainBudgets', () => {
  it('a larger dailySetBudget increases the real per-exercise set ceiling when context.domainBudgets is absent', () => {
    // Force the random roll to the top of its range so setsPerSlot's ceiling
    // (not the tier floor) determines `sets` — isolates the exact mechanism.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    const exercises = ['a', 'b', 'c', 'd', 'e', 'f'].map(scoredEx);
    const difficulty = 2;
    const volumeAdjustment = calculateVolumeAdjustment(
      { availableTime: 30 } as unknown as WorkoutGenerationContext,
      difficulty,
    );

    const ctxLowBudget = { dailySetBudget: 14 } as unknown as WorkoutGenerationContext; // domainBudgets absent
    const ctxHighBudget = { dailySetBudget: 28 } as unknown as WorkoutGenerationContext; // domainBudgets absent

    const low = assignVolume(exercises as never, ctxLowBudget, volumeAdjustment, difficulty);
    const high = assignVolume(exercises as never, ctxHighBudget, volumeAdjustment, difficulty);

    const lowTotal = low.reduce((s, e) => s + e.sets, 0);
    const highTotal = high.reduce((s, e) => s + e.sets, 0);

    expect(lowTotal).toBe(18);  // setsPerSlot=floor(14/6)=2 → clamped to tier min 3 → 6×3
    expect(highTotal).toBe(24); // setsPerSlot=floor(28/6)=4 → clamped to tier max 4 → 6×4
    expect(highTotal).toBeGreaterThan(lowTotal); // NOT swallowed back to the same total
  });
});

function buildContext(availableTime: number, difficulty: 1 | 2 | 3): WorkoutGenerationContext {
  return {
    availableTime, userLevel: 10, daysInactive: 0, intentMode: 'normal',
    persona: null, location: 'home', injuryCount: 0, difficulty,
  } as unknown as WorkoutGenerationContext;
}

describe('BudgetDistributor.distribute — end-to-end: duration-scaled budget → longer real workout (difficulty=1, no cluster-cap interference)', () => {
  const distributor = new BudgetDistributor();

  it('30 / 45 / 60-minute-equivalent budgets (14 / 21 / 28) with realistic growing exercise pools (mirrors getExerciseCountForDuration) produce increasing totalSets and estimated duration', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Pool sizes mirror workout-budgeting.utils.ts DURATION_SCALING buckets
    // ('30'→5-6, '45'→6-8, '60'→7-10) — NOT modified by this fix, reused here
    // only to make the synthetic scenario realistic.
    const pool30 = ['a', 'b', 'c', 'd', 'e', 'f'].map(scoredEx);            // 6
    const pool45 = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(scoredEx);       // 7
    const pool60 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(scoredEx); // 9

    const r30 = distributor.distribute(pool30 as never, buildContext(30, 1), 1, { dailySetBudget: 14, isSingleDomain: true, exerciseSlotCount: 6 });
    const r45 = distributor.distribute(pool45 as never, buildContext(45, 1), 1, { dailySetBudget: 21, isSingleDomain: true, exerciseSlotCount: 7 });
    const r60 = distributor.distribute(pool60 as never, buildContext(60, 1), 1, { dailySetBudget: 28, isSingleDomain: true, exerciseSlotCount: 9 });

    expect(r45.totalSets).toBeGreaterThan(r30.totalSets);
    expect(r60.totalSets).toBeGreaterThan(r45.totalSets);

    const d30 = calculateEstimatedDuration(r30.exercises);
    const d45 = calculateEstimatedDuration(r45.exercises);
    const d60 = calculateEstimatedDuration(r60.exercises);

    expect(d45).toBeGreaterThan(d30);
    expect(d60).toBeGreaterThan(d45);
  });

  it('BEFORE-FIX REPRODUCTION: with the flat pre-fix budget (14) applied at every duration, totalSets/duration do NOT increase past the 30-min pool result', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pool45 = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(scoredEx);

    const r30 = distributor.distribute(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(scoredEx) as never,
      buildContext(30, 1), 1, { dailySetBudget: 14, isSingleDomain: true, exerciseSlotCount: 6 },
    );
    // Pre-fix bug: a 45-minute session still receives the SAME flat budget=14
    // that a 30-minute session gets, because SplitDecisionService never read
    // availableTime.
    const r45preFix = distributor.distribute(
      pool45 as never,
      buildContext(45, 1), 1, { dailySetBudget: 14, isSingleDomain: true, exerciseSlotCount: 7 },
    );

    // Budget-capped total is identical even though the pool grew — the daily
    // cap silently absorbs the extra exercise, reproducing "all 3 collapse to
    // ~15-20 min" from the task's bug report.
    expect(r45preFix.totalSets).toBe(r30.totalSets);
  });
});

describe('KNOWN RESIDUAL (out of scope for this fix) — BudgetDistributor _balancedClusterCap can dominate dailySetBudget for difficulty=2 single-domain sessions', () => {
  it('documents that a single-domain, difficulty=2 (Balanced) session hard-caps at BALANCED_CLUSTER_MAX_SETS(4) x 3 = 12 sets regardless of dailySetBudget once budget > 12', () => {
    // This is a SEPARATE, pre-existing mechanism (BudgetDistributor.ts
    // _balancedClusterCap, ~530-631) — NOT part of SplitDecisionService.ts or
    // the workout-budgeting.utils.ts domain-consolidation code this task named.
    // It is out of scope to change here (touching it would affect every D2
    // session app-wide, scheduled and manual alike) but is recorded so David
    // knows duration scaling alone is not sufficient for single-domain
    // Balanced-difficulty Custom Builder sessions specifically.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const distributor = new BudgetDistributor();
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map(scoredEx);

    const r21 = distributor.distribute(pool as never, buildContext(45, 2), 2, { dailySetBudget: 21, isSingleDomain: true, exerciseSlotCount: 6 });
    const r28 = distributor.distribute(pool as never, buildContext(60, 2), 2, { dailySetBudget: 28, isSingleDomain: true, exerciseSlotCount: 6 });

    expect(r21.totalSets).toBe(12);
    expect(r28.totalSets).toBe(12); // identical despite a larger budget — the cluster cap, not the budget, is binding here
    expect(r21.log.some((l) => l.startsWith('balanced_cluster_cap:'))).toBe(true);
  });
});
