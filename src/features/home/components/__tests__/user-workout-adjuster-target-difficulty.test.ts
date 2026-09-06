import { describe, it, expect } from 'vitest';
import { buildAdjusterWorkoutOptions } from '../user-workout-adjuster-options.utils';

/**
 * F1 (docs/workout-engine/03-CHANGES.md Addendum 15, David 06.09.2026):
 * `generateHomeWorkout` always returns the D2 balanced bolt unless
 * `targetDifficulty` is set (home-workout.service.ts:212-220 — its own doc
 * comment says so explicitly). This component's generate call passed
 * `difficulty` alone, so a user tapping "קל" (1) or "עצים" (3) on the slider
 * silently received the exact same D2 workout as a user who tapped "בינוני"
 * (2) — the explicit choice was discarded 100% of the time. New meta-rule
 * (00-PLAN.md §16): explicit choice must be honored, not silently
 * substituted.
 *
 * No React component test harness exists in this repo (no
 * @testing-library/react dependency) — the fix is covered here by testing
 * the extracted pure options-builder directly, which is the exact surface
 * the bug lived on.
 */

const baseParams = {
  userProfile: {} as any,
  location: 'home' as any,
  availableTime: 30,
  derivedRequiredDomains: undefined,
  isEquipped: true,
  remainingWeeklyBudget: undefined,
  weeklyBudgetUsagePercent: undefined,
  selectedSkillId: null,
  parkEquipmentIds: undefined,
};

describe('buildAdjusterWorkoutOptions — targetDifficulty must mirror the explicit difficulty pick', () => {
  it('sets targetDifficulty to match difficulty=1 ("קל")', () => {
    const opts = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 1 });
    expect(opts.difficulty).toBe(1);
    expect(opts.targetDifficulty).toBe(1);
  });

  it('sets targetDifficulty to match difficulty=2 ("בינוני")', () => {
    const opts = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 2 });
    expect(opts.targetDifficulty).toBe(2);
  });

  it('sets targetDifficulty to match difficulty=3 ("עצים") — the exact case that used to silently collapse to D2', () => {
    const opts = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 3 });
    expect(opts.targetDifficulty).toBe(3);
  });

  it('the 3 difficulty picks produce 3 DIFFERENT options objects, not the same one 3 times', () => {
    const easy = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 1 });
    const balanced = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 2 });
    const intense = buildAdjusterWorkoutOptions({ ...baseParams, difficulty: 3 });
    // Pre-fix, targetDifficulty was always undefined regardless of the pick —
    // this is the exact assertion that would have failed before the fix.
    expect(new Set([easy.targetDifficulty, balanced.targetDifficulty, intense.targetDifficulty]).size).toBe(3);
  });
});
