import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkoutContext } from '../SplitDecisionService';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/**
 * Fix 1 (03.08.2026): Custom Builder's dailySetBudget ignored the selected
 * session duration in the `isManualOverride` branch of getWorkoutContext —
 * SplitDecisionService.ts lines ~450-483 (pre-fix: ~450-472). A 60-minute
 * Custom Builder session collapsed to the SAME ~14-set budget as a 30-minute
 * one, because neither the MANUAL_BASELINE_SETS floor nor the level-based
 * `rawDaily` term ever read `availableTime` — the field did not even exist
 * on `GetWorkoutContextInput` before this fix.
 *
 * Downstream this flows into BudgetDistributor's pyramid-aware cap
 * (constraints.dailySetBudget, core/pipeline/BudgetDistributor.ts:198-205)
 * which clamps the REAL workout to ~15-20 min regardless of how many
 * exercises getExerciseCountForDuration() selected for the longer session —
 * see BudgetDistributor.duration-scaling.test.ts for the downstream proof
 * that the larger budget is not clawed back by that cap.
 */

function buildProfile(overrides: Partial<UserFullProfile> = {}): UserFullProfile {
  return {
    id: 'test-user',
    progression: {
      domains: { pull: 10 },
      tracks: {},
      activePrograms: [],
    },
    lifestyle: {
      scheduleDays: ['א', 'ג', 'ה'], // 3 training days/week
    },
    ...overrides,
  } as unknown as UserFullProfile;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'group').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('getWorkoutContext — isManualOverride duration scaling (Fix 1)', () => {
  const userProfile = buildProfile();
  const weeklyBudget = 40; // scheduleDaysForBudget = 3 → rawDaily pre-fix = ceil(40/3) = 14

  it('BEFORE-FIX REPRODUCTION: without availableTime, dailySetBudget is the flat pre-fix value (14) regardless of caller intent', () => {
    // Omitting availableTime exercises the REFERENCE_MINUTES=30 default path,
    // which reproduces the exact pre-fix numeric output (MANUAL_BASELINE_SETS
    // floor vs rawDaily, both un-scaled) — this is what EVERY duration used
    // to collapse to before the fix.
    const ctx = getWorkoutContext({
      userProfile,
      weeklyBudget,
      isManualOverride: true,
    });
    expect(ctx.dailySetBudget).toBe(14);
  });

  it('AFTER-FIX: 30 / 45 / 60 minutes produce three genuinely different, increasing dailySetBudget values', () => {
    const ctx30 = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true, availableTime: 30 });
    const ctx45 = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true, availableTime: 45 });
    const ctx60 = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true, availableTime: 60 });

    expect(ctx30.dailySetBudget).toBe(14); // ×1.00 vs 30min reference — identical to pre-fix baseline
    expect(ctx45.dailySetBudget).toBe(21); // ×1.5
    expect(ctx60.dailySetBudget).toBe(28); // ×2.0

    expect(ctx45.dailySetBudget).toBeGreaterThan(ctx30.dailySetBudget);
    expect(ctx60.dailySetBudget).toBeGreaterThan(ctx45.dailySetBudget);
  });

  it('scales the level-based rawDaily term too, not just the MANUAL_BASELINE_SETS floor (high-level user)', () => {
    // High weekly budget → rawDaily already exceeds the 14-set floor at 30min.
    // The duration multiplier must still apply to THIS term, not just the floor,
    // otherwise high-level users would see no scaling at all.
    const highBudgetProfile = buildProfile();
    const highWeeklyBudget = 90; // scheduleDaysForBudget=3 → rawDaily(30min) = ceil(90/3) = 30

    const ctx30 = getWorkoutContext({
      userProfile: highBudgetProfile, weeklyBudget: highWeeklyBudget, isManualOverride: true, availableTime: 30,
    });
    const ctx60 = getWorkoutContext({
      userProfile: highBudgetProfile, weeklyBudget: highWeeklyBudget, isManualOverride: true, availableTime: 60,
    });

    expect(ctx30.dailySetBudget).toBe(30); // rawDaily(30) wins over floor(14)
    expect(ctx60.dailySetBudget).toBe(60); // rawDaily scaled ×2 (60) wins over floor scaled ×2 (28)
    expect(ctx60.dailySetBudget).toBeGreaterThan(ctx30.dailySetBudget);
  });

  it('non-positive / missing availableTime falls back to the 30-minute reference (no crash, no scaling)', () => {
    const ctxUndefined = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true });
    const ctxZero = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true, availableTime: 0 });
    const ctxNegative = getWorkoutContext({ userProfile, weeklyBudget, isManualOverride: true, availableTime: -10 });

    expect(ctxUndefined.dailySetBudget).toBe(14);
    expect(ctxZero.dailySetBudget).toBe(14);
    expect(ctxNegative.dailySetBudget).toBe(14);
  });
});

describe('getWorkoutContext — isManualOverride=false REGRESSION (Fix 1 must not alter this branch)', () => {
  it('Deficit-Aware branch output is IDENTICAL whether availableTime is passed or not (static fallback path)', () => {
    const userProfile = buildProfile();
    const base = {
      userProfile,
      weeklyBudget: 40,
      isManualOverride: false as const,
    };

    const withoutTime = getWorkoutContext(base);
    const with30 = getWorkoutContext({ ...base, availableTime: 30 });
    const with60 = getWorkoutContext({ ...base, availableTime: 60 });

    // availableTime is destructured but NEVER read in the isManualOverride=false
    // (else) branch — SplitDecisionService.ts lines ~473-506 — so these three
    // calls must be numerically identical.
    expect(with30.dailySetBudget).toBe(withoutTime.dailySetBudget);
    expect(with60.dailySetBudget).toBe(withoutTime.dailySetBudget);
    // Locks in the exact pre-existing formula: max(2, ceil(weeklyBudget / scheduleDays))
    // = max(2, ceil(40/3)) = 14 — unchanged by this fix.
    expect(withoutTime.dailySetBudget).toBe(14);
  });

  it('Deficit-Aware branch with domainSetsCompletedThisWeek + remainingScheduleDays is unaffected by availableTime', () => {
    const userProfile = buildProfile();
    const base = {
      userProfile,
      weeklyBudget: 40,
      isManualOverride: false as const,
      domainSetsCompletedThisWeek: { pull: 10 },
      remainingScheduleDays: 2,
    };

    const withoutTime = getWorkoutContext(base);
    const with60 = getWorkoutContext({ ...base, availableTime: 60 });

    // remainingSets = max(0, 40-10) = 30; dailyBudget = max(2, ceil(30/2)) = 15
    expect(withoutTime.dailySetBudget).toBe(15);
    expect(with60.dailySetBudget).toBe(15);
  });

  it('aggregateBudgetInfo (Master Program) branch is unaffected by availableTime or isManualOverride', () => {
    const userProfile = buildProfile();
    const aggregateBudgetInfo = {
      domainBudgets: [
        { domain: 'push', level: 10, weekly: 20, daily: 7 },
        { domain: 'pull', level: 10, weekly: 20, daily: 7 },
      ],
      totalDailyBudget: 14,
    };

    const ctx = getWorkoutContext({
      userProfile,
      aggregateBudgetInfo,
      isManualOverride: true, // even if true, aggregateBudgetInfo branch takes precedence
      availableTime: 60,
    });

    // Aggregate branch: dailySetBudget = max(2, aggregateBudgetInfo.totalDailyBudget) — untouched.
    expect(ctx.dailySetBudget).toBe(14);
  });
});
