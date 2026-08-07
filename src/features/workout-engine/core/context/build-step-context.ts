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
 */

import type { DailyActivity } from '@/features/activity/types/activity.types';
import type { StepContext } from '../types/user-context.types';

export function buildStepContext(daily: DailyActivity | null): StepContext {
  const stepGoal = daily?.stepsGoal ?? 0;
  const stepsToday = daily?.steps ?? 0;

  return {
    stepGoal,
    stepsToday,
    stepsRemaining: Math.max(0, stepGoal - stepsToday),
  };
}
