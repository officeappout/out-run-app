/**
 * build-step-context — real (not placeholder) builder for UserContext's
 * stepGoal/stepsToday/stepsRemaining (§4.1). Pure function, no store import: call sites pass
 * `useActivityStore.getState().today` in, keeping this testable and keeping workout-engine's
 * only coupling to the activity domain a type-only import (existing precedent: workout-engine
 * already imports from `@/features/activity` in 4 other files).
 *
 * `DailyActivity.stepsGoal` is already the resolved per-day goal (defaults to
 * `DAILY_STEP_GOAL`=8000 via `createEmptyDailyActivity`, and is overwritten by
 * `activityPriorityService.getDailyGoals(program)` when a program is active) — this builder
 * does not re-derive or second-guess that value.
 *
 * `healthConnected` (real-steps-connect plan, 02.09.2026, Part 1): `createEmptyDailyActivity`
 * sets `steps:0, stepsGoal:DAILY_STEP_GOAL` unconditionally, with no dependency on whether the
 * user ever connected HealthKit/Health Connect — a never-connected user gets the exact same
 * `stepsRemaining` as a real, freshly-reset day. `healthConnected===false` short-circuits to
 * `stepsRemaining:0` so no downstream generator (route.generator's `resolveRouteWorkout`,
 * `rank-suggestions.ts`'s `stepDeficit` bonus) treats a fabricated 8000-step gap as real.
 * `undefined`/`null` (param omitted, or ground-truth still loading) keep today's exact
 * behavior — byte-identical for every existing caller that doesn't pass a third-argument-
 * shaped value, matching this file's own established optional-parameter convention.
 */

import type { DailyActivity } from '@/features/activity/types/activity.types';
import type { StepContext } from '../types/user-context.types';

export function buildStepContext(
  daily: DailyActivity | null,
  healthConnected?: boolean | null,
): StepContext {
  const stepGoal = daily?.stepsGoal ?? 0;

  if (healthConnected === false) {
    return { stepGoal, stepsToday: 0, stepsRemaining: 0 };
  }

  const stepsToday = daily?.steps ?? 0;

  return {
    stepGoal,
    stepsToday,
    stepsRemaining: Math.max(0, stepGoal - stepsToday),
  };
}
