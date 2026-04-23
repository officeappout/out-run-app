"use client";

/**
 * useWeeklyRunningKm — current-week running distance for the dashboard.
 *
 * Wraps `getWeeklyRunningKm` from `activity-history.service.ts` and refreshes:
 *   - whenever the user id changes
 *   - when the current ISO date key changes (i.e. crosses midnight, including
 *     the Sunday boundary that closes/opens the week)
 *
 * Returns `0` while loading so consumers can render a clean placeholder
 * (e.g. "0 ק"מ") without a flash of "—" or NaN.
 */

import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user';
import { getWeeklyRunningKm } from '../services/activity-history.service';
import { useDateKey } from './useMidnightRefresh';

export interface UseWeeklyRunningKmResult {
  km: number;
  loading: boolean;
}

export function useWeeklyRunningKm(): UseWeeklyRunningKmResult {
  const { profile } = useUserStore();
  const userId = profile?.id;
  const dateKey = useDateKey();

  const [km, setKm] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setKm(0);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getWeeklyRunningKm(userId)
      .then((value) => {
        if (!cancelled) setKm(value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, dateKey]);

  return { km, loading };
}

export default useWeeklyRunningKm;
