'use client';

import { useMemo } from 'react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { buildWeekDots, localDateKey, type WeekDot } from '@/components/ui/v2/summary';
import { usePastWorkoutCompleted } from '@/features/activity/hooks/usePastWorkoutCompleted';
import { useUserStore } from '@/features/user';
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
 * while its own write hasn't landed (strength summary). Never forced "done". Past days of the
 * week read their saved dailyProgress (≤ 6 small reads, only while the flag is on).
 */

/** This week's days before today (local keys), Sunday first. */
function weekPastIsos(today: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < today.getDay(); i++) {
    out.push(localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + i)));
  }
  return out;
}
export function useSummaryStreakWeek({
  todayDone,
  pending,
}: {
  todayDone: boolean;
  pending?: PendingSession | null;
}): { days: WeekDot[]; best: number } {
  const weekActivities = useActivityStore((s) => s.weekActivities);
  const longestStreak = useActivityStore((s) => s.longestStreak);
  const tiers = useFlameTiersFlag();
  const uid = useUserStore((s) => s.profile?.id);
  const pastIsos = useMemo(() => (tiers ? weekPastIsos(new Date()) : []), [tiers]);
  const { goalsMap } = usePastWorkoutCompleted(tiers ? uid : undefined, pastIsos);
  const flameDayOf = useFlameDays(tiers, pending, goalsMap);
  const days = useMemo(
    () => buildWeekDots(weekActivities ?? {}, new Date(), flameDayOf ? { flameOf: flameDayOf } : { todayDone }),
    [weekActivities, todayDone, flameDayOf],
  );
  return { days, best: longestStreak ?? 0 };
}
