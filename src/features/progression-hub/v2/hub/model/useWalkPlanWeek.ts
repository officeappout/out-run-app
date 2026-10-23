'use client';

/**
 * Is this a walking-plan user, and how is this week going? ONE batched read of
 * this week's 7 schedule docs (Sunday → Saturday, getScheduleEntriesForDates),
 * cached by useBoundedQuery. Enabled only when there is no running plan (the
 * running card wins). null = not a walker this week.
 */
import { useMemo } from 'react';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { useBoundedQuery } from '../../hooks/useBoundedQuery';
import { useProgressUid } from '../../hooks/useProgressData';
import { currentWeekDates, walkWeekModel, type WalkWeekModel } from './domain-cards.model';

export function useWalkPlanWeek(enabled: boolean): { data: WalkWeekModel | null; loading: boolean } {
  const uid = useProgressUid();
  const dates = useMemo(() => currentWeekDates(new Date()), []);
  const key = uid ? `walkweek:${uid}:${dates[0]}` : null;
  const q = useBoundedQuery(
    key,
    async () => {
      const byDate = await getScheduleEntriesForDates(uid as string, dates);
      const walks = dates.flatMap((d) => (byDate?.[d] ?? []).filter(isPlannedWalkEntry));
      return walkWeekModel(walks);
    },
    enabled,
  );
  return { data: q.data, loading: q.loading };
}
