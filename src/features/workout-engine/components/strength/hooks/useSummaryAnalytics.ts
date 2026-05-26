'use client';

import type { ActivityType } from '@/features/activity/types/activity.types';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';

import {
  calculateCalories,
  calculateCoins,
  formatDuration,
  groupExercisesByCategory,
  type CompletedExercise,
  type Difficulty,
} from '../utils/summary.utils';

/**
 * useSummaryAnalytics — single source of truth for every metric the
 * StrengthSummaryPage renders.
 *
 * Absorbs:
 *   • Activity-store reads (`useDailyActivity`, `useWeeklyProgress`)
 *   • Pure session-math derivations (`calculateCalories`, `calculateCoins`,
 *     `formatDuration`, `groupExercisesByCategory`)
 *   • Streak resolution (activity-store streak takes precedence over the
 *     legacy prop streak when > 0)
 *   • Weekly volume derivations (strength minutes, sessions, target)
 *   • Streak flame-tier classification (Dopamine Chain Step 3)
 *   • Live progression overlay (uses `progressionResult` when available,
 *     otherwise falls back to the static prop values)
 *
 * Pure peripheral — no side effects, no Firebase writes, no animation work.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-2).
 */

export interface UseSummaryAnalyticsParams {
  /** Workout duration in seconds (raw, unclamped). */
  duration: number;
  /** Workout difficulty — drives the MET calorie formula. */
  difficulty: Difficulty;
  /** Full list of completed exercises (used for grouping). */
  completedExercises: CompletedExercise[];
  /** Legacy prop streak — fallback when the activity-store streak is 0. */
  propStreak: number;
  /** Current program level — fallback when progressionResult is absent. */
  currentLevel: number;
  /** Static % progress to next level — fallback when progressionResult is absent. */
  progressToNextLevel: number;
  /** Real-time progression result from processWorkoutCompletion (when available). */
  progressionResult: WorkoutCompletionResult | null;
}

export interface SummaryAnalytics {
  // ── Pure session metrics ───────────────────────────────────────────────
  /** MET-based calorie estimate for this session. */
  calories: number;
  /** Coins earned this session (1:1 with calories). */
  coins: number;
  /** Workout duration formatted as MM:SS. */
  formattedDuration: string;
  /** Workout duration rounded to whole minutes (≥1). */
  durationMinutes: number;
  /** Completed exercises grouped by category (`warmup`/`main`/`superset`/`stretch`). */
  groupedExercises: Record<string, CompletedExercise[]>;

  // ── Weekly metrics (from activity store) ───────────────────────────────
  /** Total strength minutes logged this week. */
  weeklyStrengthMinutes: number;
  /** Approx strength sessions this week (`floor(minutes / 30)`). */
  weeklyStrengthSessions: number;
  /** Target strength sessions per week (constant 3). */
  weeklyGoalSessions: number;
  /** Total active minutes (all categories) this week. */
  weeklyMinutes: number;
  /** Number of distinct active days this week. */
  daysWithActivity: number;

  // ── Streak ─────────────────────────────────────────────────────────────
  /** Resolved current streak (activity-store > prop when > 0). */
  streak: number;
  /** Streak flame tier for the AnimatedFlame component. */
  streakFlameType: ActivityType;

  // ── Live progression overlay ───────────────────────────────────────────
  /** Live program level (post-completion when progressionResult is success). */
  liveLevel: number;
  /** Live % progress to next level (rounded). */
  livePercent: number;
}

export function useSummaryAnalytics({
  duration,
  difficulty,
  completedExercises,
  propStreak,
  currentLevel,
  progressToNextLevel,
  progressionResult,
}: UseSummaryAnalyticsParams): SummaryAnalytics {
  // ── Activity-store sources ──
  const { streak: activityStreak } = useDailyActivity();
  const {
    summary: weeklySummary,
    totalMinutes: weeklyMinutes,
    daysWithActivity,
  } = useWeeklyProgress();

  // ── Pure session math ──
  const calories = calculateCalories(duration, difficulty);
  const coins = calculateCoins(calories);
  const formattedDuration = formatDuration(duration);
  // Real elapsed minutes (no clamp, just ≥1 to avoid logging 0).
  const durationMinutes = Math.max(Math.round(duration / 60), 1);
  const groupedExercises = groupExercisesByCategory(completedExercises);

  // ── Streak resolution ──
  const streak = activityStreak > 0 ? activityStreak : propStreak;
  const streakFlameType: ActivityType =
    streak >= 5 ? 'super' : streak >= 2 ? 'micro' : 'survival';

  // ── Weekly metrics ──
  const weeklyStrengthMinutes = weeklySummary?.categoryTotals?.strength || 0;
  const weeklyStrengthSessions = Math.floor(weeklyStrengthMinutes / 30);
  const weeklyGoalSessions = 3;

  // ── Live progression overlay ──
  const liveLevel =
    progressionResult?.success && progressionResult.activeProgramGain.leveledUp
      ? progressionResult.activeProgramGain.newLevel ?? currentLevel + 1
      : currentLevel;
  const livePercent = progressionResult?.success
    ? Math.round(progressionResult.activeProgramGain.newPercent)
    : progressToNextLevel;

  return {
    calories,
    coins,
    formattedDuration,
    durationMinutes,
    groupedExercises,
    weeklyStrengthMinutes,
    weeklyStrengthSessions,
    weeklyGoalSessions,
    weeklyMinutes,
    daysWithActivity,
    streak,
    streakFlameType,
    liveLevel,
    livePercent,
  };
}
