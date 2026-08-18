'use client';

/**
 * useWeeklyMovementGoal (HOME_DAILY_GOAL_V1, item 3) — per-day aerobic "movement"
 * progress for the current week. Reads the already-loaded `weekActivities` map
 * from the activity store (no extra Firestore read) and measures each day's
 * `categories.cardio.minutes` against that day's daily movement goal
 * (`categories.cardio.goalMinutes`, default 30). Both active workouts (run / walk
 * / hybrid leg) and passive HealthKit/Health-Connect active-minutes already feed
 * `cardio.minutes`, so this fills questionnaire-independently.
 *
 * Feeds the new 7-day aerobic SegmentedBar (orange in-progress / blue met).
 * Returns `undefined` when the flag is OFF.
 */

import { useMemo } from 'react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

/** Daily movement goal fallback (mirrors activity.types cardio daily goal). */
const MOVEMENT_GOAL_MIN = 30;

export interface DayMovementState {
  date: string;
  pct: number;
  met: boolean;
}

/** Sun→Sat ISO dates of the current week (matches useWeeklyStrengthGoal). */
function currentWeekDates(now: Date = new Date()): string[] {
  const sunday = new Date(now);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return toISODate(d);
  });
}

export function useWeeklyMovementGoal(enabled: boolean): DayMovementState[] | undefined {
  const weekActivities = useActivityStore((s) => s.weekActivities);
  // Stage G (18.08.2026, adversarial review): weekActivities starts as {} and
  // only fills in after async rehydration + loadFromServer, both triggered
  // elsewhere (useDailyActivity in sibling components — this hook doesn't
  // trigger its own fetch). Without gating on _hasHydrated, every date
  // defaults to {minutes:0, goal:30} and this hook would return a fully
  // "resolved" 0% array on the very first render, indistinguishable from a
  // genuine zero. Mirrors the same _hasHydrated gate useActivityRings/
  // useWeeklyProgress already use from this exact store for isLoading, and
  // matches useWeeklyStrengthGoal's sibling behavior of staying undefined
  // until real data has actually arrived.
  const hasHydrated = useActivityStore((s) => s._hasHydrated);

  return useMemo(() => {
    if (!enabled || !hasHydrated) return undefined;
    // Key-agnostic: index by the activity's own `date` field.
    const byDate: Record<string, { minutes: number; goal: number }> = {};
    Object.values(weekActivities ?? {}).forEach((a) => {
      if (!a?.date) return;
      byDate[a.date] = {
        minutes: a.categories?.cardio?.minutes ?? 0,
        goal: a.categories?.cardio?.goalMinutes ?? MOVEMENT_GOAL_MIN,
      };
    });
    return currentWeekDates().map((date) => {
      const d = byDate[date];
      const minutes = d?.minutes ?? 0;
      const goal = d?.goal ?? MOVEMENT_GOAL_MIN;
      const pct = goal > 0 ? Math.max(0, Math.min(1, minutes / goal)) : 0;
      return { date, pct, met: goal > 0 && minutes >= goal };
    });
  }, [enabled, hasHydrated, weekActivities]);
}

export default useWeeklyMovementGoal;
