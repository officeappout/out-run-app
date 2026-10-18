/**
 * Streak rules — pure, dependency-free helpers (unit-testable without
 * Firebase / Zustand).
 *
 * A day counts toward the streak when EITHER:
 *   1. minutes rule — the day's combined active minutes (all categories)
 *      reach STREAK_MINIMUM_MINUTES (10), or
 *   2. steps rule  — the day's steps reach the day's step goal
 *      (owner decision, Oct 2026).
 *
 * The goal used by the steps rule is the same one the home screen shows
 * the user: `dailyActivity.stepsGoal`, which for TODAY the activity store
 * stamps with the user's ONE resolved goal (lib/step-goal.ts — adaptive or
 * manual, the same goal the evening push uses) and which stays as that
 * day's snapshot afterwards. Falls back to DAILY_STEP_GOAL when a doc was
 * created by the ingestHealthSamples Cloud Function and never got a
 * stepsGoal field.
 *
 * A day is counted at most once: `lastStreakDate === today` is the
 * idempotency key shared by both rules (see advanceStreakForDay).
 */
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import { STREAK_MINIMUM_MINUTES } from '../types/activity.types';

/** Minimal shape of a day the rules need (a DailyActivity satisfies it). */
export interface StreakDayInput {
  categories: Record<string, { minutes: number } | undefined>;
  steps?: number;
  stepsGoal?: number;
}

export function totalActiveMinutes(day: StreakDayInput): number {
  return Object.values(day.categories ?? {}).reduce(
    (sum, cat) => sum + (Number(cat?.minutes) || 0),
    0,
  );
}

/** The step goal the user sees for this day. */
export function effectiveStepsGoal(day: Pick<StreakDayInput, 'stepsGoal'>): number {
  const goal = Number(day.stepsGoal);
  return Number.isFinite(goal) && goal > 0 ? goal : DAILY_STEP_GOAL;
}

export function dayQualifiesByMinutes(day: StreakDayInput): boolean {
  return totalActiveMinutes(day) >= STREAK_MINIMUM_MINUTES;
}

export function dayQualifiesBySteps(day: StreakDayInput): boolean {
  const steps = Number(day.steps) || 0;
  return steps > 0 && steps >= effectiveStepsGoal(day);
}

export function dayQualifiesForStreak(day: StreakDayInput): boolean {
  return dayQualifiesByMinutes(day) || dayQualifiesBySteps(day);
}

export interface StreakCounters {
  currentStreak: number;
  lastStreakDate: string;
}

/**
 * Count `todayStr` toward the streak. Same policy the store has always used
 * for the minutes path:
 *   - lastStreakDate === today  → no-op (already counted today)
 *   - gap of more than one day  → restart at 1
 *   - yesterday                 → +1
 *   - no prior date             → 1
 * Dates are 'YYYY-MM-DD' local-day strings (toLocalDayString); both parse as
 * UTC midnight, so the difference is an exact whole number of days.
 */
export function advanceStreakForDay(
  counters: StreakCounters,
  todayStr: string,
): StreakCounters & { advanced: boolean } {
  const { currentStreak, lastStreakDate } = counters;
  if (lastStreakDate === todayStr) {
    return { currentStreak, lastStreakDate, advanced: false };
  }
  let next: number;
  if (lastStreakDate) {
    const daysDiff = Math.floor(
      (new Date(todayStr).getTime() - new Date(lastStreakDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    next = daysDiff > 1 ? 1 : currentStreak + 1;
  } else {
    next = 1;
  }
  return { currentStreak: next, lastStreakDate: todayStr, advanced: true };
}
