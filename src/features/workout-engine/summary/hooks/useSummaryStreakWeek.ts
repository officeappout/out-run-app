'use client';

import { useMemo } from 'react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { buildWeekDots, type WeekDot } from '@/components/ui/v2/summary';

/**
 * Home-v2 summaries: this week's 7 streak dots + the best streak, read from
 * the activity store (the same weekActivities the home week strip uses).
 * Read-only — no writes. `todayDone` marks today as trained in the live
 * post-workout flow, where the session's own activity write may not have
 * landed yet (strength syncs at Finish).
 */
export function useSummaryStreakWeek({ todayDone }: { todayDone: boolean }): { days: WeekDot[]; best: number } {
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const longestStreak = useActivityStore((s) => s.longestStreak);
  const days = useMemo(() => buildWeekDots(weekActivities ?? {}, new Date(), { todayDone }), [weekActivities, todayDone]);
  return { days, best: longestStreak ?? 0 };
}
