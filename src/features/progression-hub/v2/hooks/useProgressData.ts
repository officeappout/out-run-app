'use client';

/**
 * Progress tab v2 data hooks — each one bounded and lazily enabled.
 *
 * Summary (P-1): current + previous window at the same stage —
 *   week:  ≤ 14 dailyActivity docs + ≤ 40 workouts
 *   month: ≤ 62 dailyActivity docs + ≤ 100 workouts
 * Activity tabs (P-2): the last 40 workouts of that type / 30 days of steps,
 * read only while that tab is open.
 */
import { useMemo } from 'react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  getDailyActivityRange,
  getRecentDays,
  getRecentExerciseSnapshots,
  getRecentWorkoutsOfType,
  getWorkoutsWindow,
} from '../services/progress-data.service';
import { periodRanges, type ProgressPeriod } from '../utils/progress-period';
import { useBoundedQuery } from './useBoundedQuery';

export function useProgressUid(): string | null {
  const id = useUserStore((s) => s.profile?.id);
  return id ?? auth.currentUser?.uid ?? null;
}

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

export function usePeriodData(period: ProgressPeriod) {
  const uid = useProgressUid();
  const now = useMemo(() => new Date(), []);
  const ranges = useMemo(() => periodRanges(period, now), [period, now]);
  const key = uid ? `period:${uid}:${period}:${dayKey(now)}` : null;
  const q = useBoundedQuery(key, async () => {
    const [workouts, days] = await Promise.all([
      getWorkoutsWindow(uid as string, ranges.previous.start, ranges.current.end, period === 'week' ? 40 : 100),
      getDailyActivityRange(uid as string, ranges.previous.startISO, ranges.current.endISO, period === 'week' ? 14 : 62),
    ]);
    return { workouts, days };
  });
  return { ...q, ranges, now };
}

export function useRecentOfType(type: 'running' | 'walking' | 'strength', enabled: boolean) {
  const uid = useProgressUid();
  const key = uid ? `type:${uid}:${type}` : null;
  return useBoundedQuery(key, () => getRecentWorkoutsOfType(uid as string, type, 40), enabled);
}

export function useRecentDays(enabled: boolean) {
  const uid = useProgressUid();
  const key = uid ? `days30:${uid}` : null;
  return useBoundedQuery(key, () => getRecentDays(uid as string, 30), enabled);
}

export function useRecentExercises(enabled: boolean) {
  const uid = useProgressUid();
  const key = uid ? `exercises:${uid}` : null;
  return useBoundedQuery(key, () => getRecentExerciseSnapshots(uid as string, 5), enabled);
}
