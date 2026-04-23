'use client';

/**
 * useDayStatus — Centralized Day State Brain
 *
 * Single hook that encapsulates:
 *   1. The Completion Bridge: totalMinutes >= 10 OR workoutCompleted flag
 *   2. Session / icon priority: Strength > Cardio > Maintenance (sorted desc by minutes)
 *
 * Returns a memoized getter function (not a per-date value) so it can be
 * called inside useMemo loops for any number of dates without violating the
 * Rules of Hooks.
 *
 * Usage:
 * ```tsx
 * const getDayStatus = useDayStatus();
 * // Inside useMemo or render:
 * const status = getDayStatus('2026-04-20', scheduleEntry?.completed);
 * ```
 */

import { useCallback } from 'react';
import { useActivityStore } from '../store/useActivityStore';
import { useDailyProgress } from '@/features/home/hooks/useDailyProgress';
import { STREAK_MINIMUM_MINUTES, type ActivityCategory } from '../types/activity.types';
import type { DaySessionInput } from '@/features/home/utils/day-display.utils';
import { useDateKey } from './useMidnightRefresh';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DayStatusResult {
  /** True when the Completion Bridge fires (minutes >= 10 OR workoutCompleted). */
  isCompleted: boolean;
  /** True when any activity data or workoutCompleted flag is present. */
  hasActivity: boolean;
  /** Total activity minutes across all categories. */
  totalMinutes: number;
  /** Per-category minutes (from the activity store, or zeroes if no data). */
  categories: { strength: number; cardio: number; maintenance: number };
  /** Dominant category as computed by the activity store (null if no data). */
  dominantCategory: ActivityCategory | null;
  /**
   * Sessions derived from real per-category minutes (categories with >= 10 min,
   * sorted descending by minutes). Pass to resolveDayDisplayProps to enable
   * multi-session icon alternation in DayIconCell.
   */
  sessions: DaySessionInput[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns a stable `getDayStatus(date, scheduleCompleted?)` function.
 *
 * @param date            - ISO date string (YYYY-MM-DD, local timezone)
 * @param scheduleCompleted - Optional Firestore schedule entry `completed` flag.
 *                          For today, this is ignored in favour of the live
 *                          `workoutCompleted` flag from `useDailyProgress`.
 *                          For past days, it is used as the secondary bridge signal.
 */
export function useDayStatus() {
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const todayActivity  = useActivityStore((s) => s.today);
  const todayProgress  = useDailyProgress();
  // Subscribe to the global midnight clock. When dateKey flips at 00:00,
  // the useCallback below gets a new identity → every consumer's useMemo
  // invalidates → calendars re-render with the correct "today" cell.
  const dateKey        = useDateKey();

  return useCallback(
    (date: string, scheduleCompleted?: boolean): DayStatusResult => {
      // Read "today" from the dateKey atom (kept fresh by useMidnightRefresh)
      // rather than from a fresh `new Date()` on every call. This way a stale
      // closure cannot misclassify an over-midnight date.
      const isToday   = date === dateKey;
      const activity  = isToday ? todayActivity : (weekActivities[date] ?? null);

      const categories = activity
        ? {
            strength:    activity.categories.strength.minutes,
            cardio:      activity.categories.cardio.minutes,
            maintenance: activity.categories.maintenance.minutes,
          }
        : { strength: 0, cardio: 0, maintenance: 0 };

      const totalMinutes =
        categories.strength + categories.cardio + categories.maintenance;

      // ── Completion Bridge ─────────────────────────────────────────────────
      // Today: either >= 10 min logged OR the "Done" button was pressed.
      // Past:  either >= 10 min logged (from weekActivities) OR the Firestore
      //        schedule entry / dailyProgress flag says completed.
      const workoutCompleted = isToday
        ? !!todayProgress?.workoutCompleted
        : (scheduleCompleted ?? false);

      const isCompleted = totalMinutes >= STREAK_MINIMUM_MINUTES || workoutCompleted;
      const hasActivity = totalMinutes > 0 || workoutCompleted;

      // ── Session / Icon Priority ───────────────────────────────────────────
      // Only categories with >= STREAK_MINIMUM_MINUTES (10) are promoted to
      // their own session icon. Sorted desc by minutes so the dominant category
      // always renders first when DayIconCell alternates.
      const sessions: DaySessionInput[] = (
        ['strength', 'cardio', 'maintenance'] as const
      )
        .filter((cat) => categories[cat] >= STREAK_MINIMUM_MINUTES)
        .map((cat) => ({ category: cat, minutes: categories[cat] }))
        .sort((a, b) => b.minutes - a.minutes);

      return {
        isCompleted,
        hasActivity,
        totalMinutes,
        categories,
        dominantCategory: activity?.dominantCategory ?? null,
        sessions,
      };
    },
    [weekActivities, todayActivity, todayProgress, dateKey],
  );
}
