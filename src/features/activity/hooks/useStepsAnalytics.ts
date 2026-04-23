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

export type StepsTimeRange = 'day' | 'week' | 'month' | 'year';

/** Single chart bar — Recharts-friendly. */
export interface StepsChartPoint {
  /** X-axis label (short date or month name). */
  label: string;
  /** Aggregated step count for the bucket. */
  value: number;
  /** Whether the user met their goal for this bucket. */
  goalMet: boolean;
}

export interface StepsAnalyticsStats {
  /** Steps logged today (most recent snapshot). */
  todaySteps: number;
  /** Average daily steps across the active range. */
  averageDaily: number;
  /** Best single day (steps) within the active range. */
  bestDay: number;
  /** Total steps across the active range. */
  totalSteps: number;
  /** Days within the range where the goal was met. */
  daysAtGoal: number;
  /** Days in the range that have any data. */
  daysWithData: number;
  /** Effective daily goal (last known stepsGoal, or 10000 default). */
  dailyGoal: number;
}

interface UseStepsAnalyticsReturn {
  chartData: StepsChartPoint[];
  stats: StepsAnalyticsStats;
  loading: boolean;
  error: boolean;
}

const FALLBACK_GOAL = 10_000;
const HISTORY_LIMIT_DAYS = 365;

const RANGE_DAYS: Record<Exclude<StepsTimeRange, 'year'>, number> = {
  day: 1,
  week: 7,
  month: 30,
};

const HEBREW_MONTHS = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יונ׳',
  'יול׳', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
];

const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function fmtShortDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr.slice(5);
  return `${HEBREW_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtMonthLabel(year: number, monthZeroBased: number): string {
  return HEBREW_MONTHS[monthZeroBased] ?? String(monthZeroBased + 1);
}

/** Slice the most recent `n` snapshots, oldest → newest. */
function takeLastN(snapshots: DailyStepsSnapshot[], n: number): DailyStepsSnapshot[] {
  if (snapshots.length <= n) return snapshots;
  return snapshots.slice(snapshots.length - n);
}

/**
 * Aggregate snapshots into 12 monthly bars for the Year view.
 * Months without data still appear as zero bars so the timeline reads
 * left-to-right consistently.
 */
function bucketByMonth(snapshots: DailyStepsSnapshot[]): StepsChartPoint[] {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  type MonthBucket = { year: number; month: number; total: number; goalMet: boolean };
  const buckets: MonthBucket[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), total: 0, goalMet: false });
  }

  for (const snap of snapshots) {
    const d = new Date(snap.date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) continue;
    const idx = buckets.findIndex(
      (b) => b.year === d.getFullYear() && b.month === d.getMonth(),
    );
    if (idx === -1) continue;
    buckets[idx].total += snap.steps;
    // For monthly view, "goalMet" means the user hit goal on at least one day
    if (snap.stepsGoalMet) buckets[idx].goalMet = true;
  }

  return buckets.map((b) => ({
    label: fmtMonthLabel(b.year, b.month),
    value: b.total,
    goalMet: b.goalMet,
  }));
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
    setLoading(true);
    setError(false);

    getStepsTrend(uid, HISTORY_LIMIT_DAYS)
      .then((trend) => {
        if (cancelled) return;
        setSnapshots(trend);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo<StepsChartPoint[]>(() => {
    if (snapshots.length === 0) return [];

    if (timeRange === 'year') {
      return bucketByMonth(snapshots);
    }

    const days = RANGE_DAYS[timeRange];
    const window = takeLastN(snapshots, days);
    return window.map((s) => ({
      label: fmtShortDayLabel(s.date),
      value: s.steps,
      goalMet: s.stepsGoalMet,
    }));
  }, [snapshots, timeRange]);

  const stats = useMemo<StepsAnalyticsStats>(() => {
    const last = snapshots[snapshots.length - 1];
    const dailyGoal = last?.stepsGoal && last.stepsGoal > 0 ? last.stepsGoal : FALLBACK_GOAL;

    let activeWindow: DailyStepsSnapshot[];
    if (timeRange === 'year') {
      activeWindow = snapshots; // up to a year
    } else {
      activeWindow = takeLastN(snapshots, RANGE_DAYS[timeRange]);
    }

    const totalSteps = activeWindow.reduce((sum, s) => sum + s.steps, 0);
    const daysWithData = activeWindow.filter((s) => s.steps > 0).length;
    const bestDay = activeWindow.reduce((mx, s) => (s.steps > mx ? s.steps : mx), 0);
    const daysAtGoal = activeWindow.filter((s) => s.stepsGoalMet).length;
    const averageDaily =
      daysWithData > 0 ? Math.round(totalSteps / daysWithData) : 0;

    return {
      todaySteps: last?.steps ?? 0,
      averageDaily,
      bestDay,
      totalSteps,
      daysAtGoal,
      daysWithData,
      dailyGoal,
    };
  }, [snapshots, timeRange]);

  return { chartData, stats, loading, error };
}

export default useStepsAnalytics;
