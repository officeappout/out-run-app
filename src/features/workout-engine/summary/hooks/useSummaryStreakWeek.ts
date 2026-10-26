'use client';

import { useMemo } from 'react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { buildWeekDots, type WeekDot } from '@/components/ui/v2/summary';
import { useFlameTiersFlag } from '@/features/activity/hooks/useFlameTiersFlag';
import { useFlameDays } from '@/features/activity/hooks/useFlameDays';
import type { PendingSession } from '@/features/activity/lib/flame-day-input';

/**
 * Home-v2 summaries: this week's 7 streak dots + the best streak, read from
 * the activity store (the same weekActivities the home week strip uses).
 * Read-only — no writes. `todayDone` marks today as trained in the live
 * post-workout flow, where the session's own activity write may not have
 * landed yet (strength syncs at Finish).
 *
 * enable_flame_tiers_v1: `todayDone` is ignored — every dot (today included) carries
 * flameLevelForDay's real level; `pending` adds this session's minutes / sets to today
 * while its own write hasn't landed (strength summary). Never forced "done".
 */
export function useSummaryStreakWeek({
  todayDone,
  pending,
}: {
  todayDone: boolean;
  pending?: PendingSession | null;
}): { days: WeekDot[]; best: number } {
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const longestStreak = useActivityStore((s) => s.longestStreak);
  const flameDayOf = useFlameDays(useFlameTiersFlag(), pending);
  const days = useMemo(
    () => buildWeekDots(weekActivities ?? {}, new Date(), flameDayOf ? { flameOf: flameDayOf } : { todayDone }),
    [weekActivities, todayDone, flameDayOf],
  );
  return { days, best: longestStreak ?? 0 };
}
