'use client';

/**
 * useStepsAnalytics
 *
 * Loads up to a year of `dailyActivity` step snapshots once, then
 * derives bar-chart-ready buckets for the Day / Week / Month / Year
 * tabs of the Steps Analytics page (drill-down from StepsSummaryCard).
 *
 * Storage today is daily-grain only (one `dailyActivity/{uid}_{YYYY-MM-DD}`
 * doc per day). For each tab:
 *   • day   — single bar for today.
 *   • week  — last 7 calendar days (one bar per day).
 *   • month — last 30 calendar days (one bar per day).
 *   • year  — last 12 calendar months (one bar per month, summed).
 *
 * Time-range filtering is done client-side via `useMemo` so switching
 * tabs is instant with zero extra Firestore reads — same pattern as
 * `useExerciseAnalytics`.
 */

import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  getStepsTrend,
  type DailyStepsSnapshot,
} from '../services/activity-history.service';
import { onLiveSample } from '@/lib/healthBridge/eventEmitter';
import {
  deriveStepsChartData,
  deriveStepsStats,
  toDateKey,
  type StepsTimeRange,
  type StepsChartPoint,
  type StepsAnalyticsStats,
} from '../lib/steps-analytics.logic';

export type { StepsTimeRange, StepsChartPoint, StepsAnalyticsStats };

interface UseStepsAnalyticsReturn {
  /** Raw per-day snapshots (oldest → newest) — exposed for day-navigation UI. */
  snapshots: DailyStepsSnapshot[];
  chartData: StepsChartPoint[];
  stats: StepsAnalyticsStats;
  loading: boolean;
  error: boolean;
}

const HISTORY_LIMIT_DAYS = 365;

/** Debounce before refetching after a live sample — gives the outbox flush
 *  (enqueue → ingestHealthSamples → dailyActivity write) a moment to land,
 *  and coalesces rapid successive samples into one Firestore read. */
const LIVE_REFRESH_DELAY_MS = 3_000;

function todayKey(): string {
  return toDateKey(new Date());
}

export function useStepsAnalytics(timeRange: StepsTimeRange): UseStepsAnalyticsReturn {
  const [snapshots, setSnapshots] = useState<DailyStepsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const fetchTrend = () => {
      setLoading(true);
      setError(false);
      getStepsTrend(uid, HISTORY_LIMIT_DAYS)
        .then((trend) => {
          if (!cancelled) setSnapshots(trend);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    fetchTrend();

    // Refresh when a fresh sample lands for today, so the detail page
    // updates without the user having to leave and come back — same
    // samplesAvailable → syncSince → pushSample chain useLiveDailyActivity
    // reacts to, just refetching from Firestore (debounced) instead of
    // applying a local overlay, since this hook already reads server-
    // aggregated snapshots rather than a single live "today" value.
    const today = todayKey();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const off = onLiveSample((evt) => {
      if (evt.date !== today) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchTrend, LIVE_REFRESH_DELAY_MS);
    });

    return () => {
      cancelled = true;
      off();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  const chartData = useMemo<StepsChartPoint[]>(
    () => deriveStepsChartData(snapshots, timeRange),
    [snapshots, timeRange],
  );

  const stats = useMemo<StepsAnalyticsStats>(
    () => deriveStepsStats(snapshots, timeRange),
    [snapshots, timeRange],
  );

  return { snapshots, chartData, stats, loading, error };
}

export default useStepsAnalytics;
