'use client';

/**
 * This week vs last week at the same stage — the exact numbers of the Progress page's
 * summary ring (usePeriodData('week') + summarizePeriod). Home's progress slot reads it
 * for the active-minutes ring and the walking card. Bounded (≤ 40 workouts + ≤ 14 day
 * docs), one-shot, and cached per key for 60 s — the ring, the walking card and the
 * Progress page share one read.
 */
import { useMemo } from 'react';
import { usePeriodData } from '@/features/progression-hub/v2/hooks/useProgressData';
import { summarizePeriod, type PeriodSummary } from '@/features/progression-hub/v2/utils/progress-period';

export interface WeekActivitySummary {
  current: PeriodSummary | null;
  previous: PeriodSummary | null;
  loading: boolean;
  error: boolean;
}

export function useWeekActivitySummary(): WeekActivitySummary {
  const { data, loading, error, ranges } = usePeriodData('week');
  return useMemo(() => {
    if (!data) return { current: null, previous: null, loading, error };
    return {
      current: summarizePeriod(data.workouts, data.days, ranges.current),
      previous: summarizePeriod(data.workouts, data.days, ranges.previous),
      loading: false,
      error: false,
    };
  }, [data, loading, error, ranges]);
}
