/**
 * streak-today-left — how many more active minutes today needs before it counts
 * toward the streak (pure). Pilot AG6: a short workout (under the 10-minute bar,
 * streak-day.core.ts) leaves the flame unlit, so the summary says why.
 *
 * Same rule as the streak itself (dayLeftToClose): a day closed by minutes OR by
 * the step goal needs nothing more (0). `pending` adds this session's minutes
 * while its own activity write hasn't landed (strength summary).
 */
import { dayLeftToClose, type StreakDayCounts } from '@/features/activity/lib/streak-day.core';
import type { PendingSession } from '@/features/activity/lib/flame-day-input';

export function streakMinutesLeftToday(
  today: StreakDayCounts | null | undefined,
  pending?: PendingSession | null,
): number {
  const extra = (Number(pending?.strengthMinutes) || 0) + (Number(pending?.cardioMinutes) || 0);
  const day: StreakDayCounts = {
    ...(today ?? {}),
    categories: { ...(today?.categories ?? {}), __pending: { minutes: extra } },
  };
  return dayLeftToClose(day).minutes;
}
