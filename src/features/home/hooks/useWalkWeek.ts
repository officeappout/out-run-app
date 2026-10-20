'use client';

/**
 * Home's walking slice (enable_home_v2, owner 20.10.2026): ONE batched read of the next
 * 7 day docs (today … +6, getScheduleEntriesForDates) → is this user walking (a planned
 * walk in the coming week), today's walk, the next one. No listener; re-read when
 * `version` changes (the home's scheduleVersion). Disabled → no read, nothing.
 */
import { useEffect, useState } from 'react';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { walkWeekFrom, nextSevenDates, EMPTY_WALK_WEEK, type WalkWeekState } from '../utils/walk-week';

export type { WalkWeekState };

export function useWalkWeek(uid: string | null | undefined, enabled: boolean, version?: unknown): WalkWeekState {
  const [state, setState] = useState<WalkWeekState>(EMPTY_WALK_WEEK);
  useEffect(() => {
    if (!enabled || !uid) {
      setState(EMPTY_WALK_WEEK);
      return;
    }
    let alive = true;
    const dates = nextSevenDates();
    getScheduleEntriesForDates(uid, dates)
      .then((byDate: Record<string, UserScheduleEntry[]> | null) => {
        if (alive && byDate) setState(walkWeekFrom(byDate, dates, isPlannedWalkEntry));
      })
      .catch((err) => console.warn('[useWalkWeek] read failed', err));
    return () => {
      alive = false;
    };
  }, [uid, enabled, version]);
  return state;
}
