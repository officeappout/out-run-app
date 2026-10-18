import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBudgetDistributor } from '../BudgetDistributor';
import type { WorkoutGenerationContext } from '../../../logic/workout-generator.types';
import type { BudgetConstraints } from '../pipeline.types';

/**
 * cluster-cap-domain-floor — domain-balance audit, 11.10.2026
 * ────────────────────────────────────────────────────────────────────────
 * Root cause of the "legs+push mostly gives push" bug, found while
 * following up on PR #228 (the analogous push/pull fix). Confirmed live
 * via generateHomeWorkoutTrio() against the real invariants fixture: a
 * legs+push 2-day/week user got COMPLETE legs starvation (0 of 3-4 main
 * exercises) at bolt2 and bolt3, every seed tested, despite
 * selectExercisesWithDomainQuotas already guaranteeing legs a slot
 * upstream — these two caps ran AFTER that guarantee and silently
 * discarded it:
 *
 *   - `_balancedClusterCap` (D2): its OWN diversity check can never reach
 *     BALANCED_DIVERSITY_THRESHOLD=3 for a 2-domain request, so it always
 *     culls to the narrower 3-exercise baseline by tier/score alone.
 *   - `_skillClusterCap` (D3): no domain check at all — culls to
 *     SKILL_CLUSTER_MAX_MAIN by tier/score alone.
 *
 * These tests run the REAL `BudgetDistributor.distribute()` pipeline
 * end-to-end (same pattern as balanced-cluster-cap-duration-aware.test.ts)
 * with a mixed legs+push pool where legs intentionally scores LOWER than
 * push (the exact condition that reproduced the starvation live), and
 * asserts the fix: `context.requiredDomains` guarantees at least 1
 * survivor per domain before the rest fill in by tier/score as before.
 */

const legsEx = (id: string, score: number, movementGroup: 'squat' | 'hinge' = 'squat') => ({
  exercise: {
    id,
    name: { he: id, en: id },
    movementGroup,
    programIds: ['legs'],
    secondsPerRep: 3,
    symmetry: 'bilateral',
    tags: [],
  },
  method: 'bodyweight',
  mechanicalType: 'legs',
  score,
  reasoning: [],
} as never);

const pushEx = (id: string, score: number, movementGroup: 'horizontal_push' | 'vertical_push' = 'horizontal_push') => ({
  exercise: {
    id,
    name: { he: id, en: id },
    movementGroup,
    programIds: ['push'],
    secondsPerRep: 3,
    symmetry: 'bilateral',
    tags: [],
  },
  method: 'bodyweight',
  mechanicalType: 'push',
  score,
  reasoning: [],
} as never);

const baseContext = (overrides: Partial<WorkoutGenerationContext>): WorkoutGenerationContext =>
  ({
    availableTime: 30,
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

const domainsOf = (exercises: Array<{ exercise: { movementGroup?: string | null } }>): Set<string> => {
  const s = new Set<string>();
  for (const e of exercises) {
    const mg = e.exercise.movementGroup;
    if (mg === 'squat' || mg === 'hinge') s.add('legs');
    else if (mg === 'horizontal_push' || mg === 'vertical_push') s.add('push');
  }
  return s;
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('BudgetDistributor cluster caps — per-domain survivor floor', () => {
  it('D2 (_balancedClusterCap): legs survives the baseline-3 cull when requiredDomains=[legs,push], even though legs scores lowest', () => {
    // 2 legs (low score) + 4 push (high score) — a 2-domain pool that can
    // never satisfy the diversity threshold (only 2 distinct domains),
    // so this always culls to the 3-exercise baseline.
    const pool = [
      legsEx('legs_1', 40, 'squat'),
      legsEx('legs_2', 35, 'hinge'),
      pushEx('push_1', 90, 'vertical_push'),
      pushEx('push_2', 85, 'horizontal_push'),
      pushEx('push_3', 80, 'vertical_push'),
      pushEx('push_4', 75, 'horizontal_push'),
    ];
    const constraints: BudgetConstraints = {
      dailySetBudget: 14,
      isSingleDomain: false,
      exerciseSlotCount: 6,
    };
    const distributor = createBudgetDistributor();

    // 15 min (was 30): since generator QA round 1 the cluster never culls below the
    // duration's minimum (minMainExercisesFor: 30 min → 4), so the 3-exercise
    // baseline cull this test is about only bites at ≤15 min (minimum 3).
    const withoutFix = distributor.distribute(
      pool, baseContext({ availableTime: 15 }), 2, constraints,
    );
    // Sanity: confirms the cull actually fires and drops to 3 (the bug's own precondition).
    expect(mainsOf(withoutFix.exercises).length).toBe(3);

    const withDomains = distributor.distribute(
      pool,
      baseContext({ availableTime: 15, requiredDomains: ['legs', 'push'] }),
      2,
      constraints,
    );
    const mains = mainsOf(withDomains.exercises);
    expect(mains.length).toBe(3);
    expect(domainsOf(mains).has('legs')).toBe(true);
    expect(domainsOf(mains).has('push')).toBe(true);
  });

  it('D3 (_skillClusterCap): legs survives the SKILL_CLUSTER_MAX_MAIN cull when requiredDomains=[legs,push]', () => {
    // 2 legs (low score) + 4 push (high score), isSingleDomain=true so
    // isSkillOrStrengthSession fires (matches the live legs+push session,
    // which StructureDirector classifies 'single_domain' since it isn't
    // literally push+pull).
    const pool = [
      legsEx('legs_1', 30, 'squat'),
      legsEx('legs_2', 28, 'hinge'),
      pushEx('push_1', 95, 'vertical_push'),
      pushEx('push_2', 90, 'horizontal_push'),
      pushEx('push_3', 85, 'vertical_push'),
      pushEx('push_4', 80, 'horizontal_push'),
    ];
    const constraints: BudgetConstraints = {
      dailySetBudget: 16,
      isSingleDomain: true,
      exerciseSlotCount: 6,
    };
    const distributor = createBudgetDistributor();

    const withoutFix = distributor.distribute(
      pool, baseContext({ availableTime: 30 }), 3, constraints,
    );
    // Sanity: confirms the cull actually fires (SKILL_CLUSTER_MAX_MAIN=4, pool has 6).
    expect(mainsOf(withoutFix.exercises).length).toBe(4);
    expect(domainsOf(mainsOf(withoutFix.exercises)).has('legs')).toBe(false);

    const withDomains = distributor.distribute(
      pool,
      baseContext({ availableTime: 30, requiredDomains: ['legs', 'push'] }),
      3,
      constraints,
    );
    const mains = mainsOf(withDomains.exercises);
    expect(mains.length).toBe(4);
    expect(domainsOf(mains).has('legs')).toBe(true);
    expect(domainsOf(mains).has('push')).toBe(true);
  });

  it('single-domain session (no requiredDomains, or just 1 entry): unaffected, pure tier/score cull as before', () => {
    const pool = [
      pushEx('push_1', 95, 'vertical_push'),
      pushEx('push_2', 90, 'horizontal_push'),
      pushEx('push_3', 85, 'vertical_push'),
      pushEx('push_4', 80, 'horizontal_push'),
      pushEx('push_5', 75, 'vertical_push'),
    ];
    const constraints: BudgetConstraints = {
      dailySetBudget: 14,
      isSingleDomain: true,
      exerciseSlotCount: 5,
    };
    const distributor = createBudgetDistributor();

    const result = distributor.distribute(
      pool, baseContext({ availableTime: 15, requiredDomains: ['push'] }), 2, constraints,
    ); // 15 min: the 3-exercise baseline (30 min now keeps the 4-exercise minimum)
    const mains = mainsOf(result.exercises);
    expect(mains.length).toBe(3);
    // Same top-3-by-score survivors as the pre-fix behavior would produce.
    expect(mains.map((m) => m.exercise.id).sort()).toEqual(['push_1', 'push_2', 'push_3']);
  });
});
