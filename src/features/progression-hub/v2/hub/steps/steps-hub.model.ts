/**
 * Steps page (hub v2, PG-5) — everything the page shows, derived from the SAME
 * snapshots /activity/steps loads (useStepsAnalytics: ≤ 365 dailyActivity docs,
 * one read). Pure; the range stats come from deriveStepsStats so the numbers
 * match the existing steps page exactly.
 */
import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import {
  deriveStepsStats,
  sameDayLastWeekSteps,
  toDateKey,
  type StepsAnalyticsStats,
  type StepsTimeRange,
} from '@/features/activity/lib/steps-analytics.logic';
import { STEPS_PER_KM_ESTIMATE } from '@/lib/steps-estimate';

/** The existing page's fallback when no distance is synced (~1,300 steps per km). Shared in src/lib. */
export { STEPS_PER_KM_ESTIMATE };
/** A brisk walk, for "≈ N min of walking" to the goal. */
export const STEPS_PER_MINUTE_WALK = 100;

const RANGE_DAYS: Record<Exclude<StepsTimeRange, 'year'>, number> = { day: 1, week: 7, month: 30 };

export interface StepsHero {
  dateKey: string | null;
  steps: number;
  goal: number;
  /** 0–100+, uncapped (the ring caps it). */
  pct: number;
  remaining: number;
  walkMinutes: number;
  km: number;
  kmIsEstimate: boolean;
  /** Same weekday last week (null → no delta). */
  lastWeekSameDay: number | null;
}

/** The ring card: the selected day on the day tab, else today. */
export function stepsHero(snapshots: readonly DailyStepsSnapshot[], range: StepsTimeRange, dayOffset: number, fallbackGoal: number): StepsHero {
  const idx = snapshots.length - 1 - (range === 'day' ? dayOffset : 0);
  const snap = idx >= 0 ? snapshots[idx] : undefined;
  const steps = snap?.steps ?? 0;
  const goal = snap?.stepsGoal && snap.stepsGoal > 0 ? snap.stepsGoal : fallbackGoal;
  const remaining = Math.max(0, goal - steps);
  const realKm = (snap?.distanceMeters ?? 0) / 1000;
  return {
    dateKey: snap?.date ?? null,
    steps,
    goal,
    pct: goal > 0 ? (steps / goal) * 100 : 0,
    remaining,
    walkMinutes: Math.ceil(remaining / STEPS_PER_MINUTE_WALK),
    km: realKm > 0 ? realKm : steps / STEPS_PER_KM_ESTIMATE,
    kmIsEstimate: !(realKm > 0),
    lastWeekSameDay: sameDayLastWeekSteps(snapshots as DailyStepsSnapshot[], snap?.date),
  };
}

export interface StepsTiles extends StepsAnalyticsStats {
  /** Date of the best day in the range (YYYY-MM-DD), null when no steps. */
  bestDate: string | null;
  /** Real synced km over the range, else the steps estimate. */
  distanceKm: number;
  /** Daily average of the window before (week / month: the previous 7 / 30 days); null for day / year or no data. */
  previousAverage: number | null;
}

/** The range's tiles — deriveStepsStats + the best day's date + the range distance. */
export function stepsTiles(snapshots: readonly DailyStepsSnapshot[], range: StepsTimeRange): StepsTiles {
  const list = snapshots as DailyStepsSnapshot[];
  const stats = deriveStepsStats(list, range);
  const window = range === 'year' ? list : list.slice(Math.max(0, list.length - RANGE_DAYS[range]));
  const best = stats.bestDay > 0 ? window.find((s) => s.steps === stats.bestDay) ?? null : null;
  const distanceKm = stats.totalDistanceMeters > 0 ? stats.totalDistanceMeters / 1000 : stats.totalSteps / STEPS_PER_KM_ESTIMATE;
  let previousAverage: number | null = null;
  if (range === 'week' || range === 'month') {
    const n = RANGE_DAYS[range];
    const prev = list.slice(Math.max(0, list.length - 2 * n), Math.max(0, list.length - n)).filter((s) => s.steps > 0);
    previousAverage = prev.length ? Math.round(prev.reduce((sum, s) => sum + s.steps, 0) / prev.length) : null;
  }
  return { ...stats, bestDate: best?.date ?? null, distanceKm, previousAverage };
}

export interface DayCell {
  date: string;
  steps: number;
  /** null = no data that day. */
  met: boolean | null;
}

/** The last `n` calendar days ending today (oldest → newest), missing days as no-data cells. */
export function lastNDays(snapshots: readonly DailyStepsSnapshot[], now: Date, n = 30): DayCell[] {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
    const key = toDateKey(d);
    const s = byDate.get(key);
    const has = !!s && s.steps > 0;
    return { date: key, steps: s?.steps ?? 0, met: has ? s!.stepsGoalMet || (s!.stepsGoal > 0 && s!.steps >= s!.stepsGoal) : null };
  });
}

export interface MonthAverage {
  /** YYYY-MM */
  key: string;
  month: number;
  year: number;
  /** Daily average over the month's days with steps (0 = no data). */
  average: number;
}

/** The last 12 months' daily averages (oldest → newest), months without data at 0. */
export function monthlyAverages(snapshots: readonly DailyStepsSnapshot[], now: Date): MonthAverage[] {
  const out: MonthAverage[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const days = snapshots.filter((s) => s.date.startsWith(key) && s.steps > 0);
    const total = days.reduce((sum, s) => sum + s.steps, 0);
    out.push({ key, month: d.getMonth(), year: d.getFullYear(), average: days.length ? Math.round(total / days.length) : 0 });
  }
  return out;
}

/** Trim leading empty months so a new user's year card doesn't start with a row of zeros. */
export function trimLeadingEmpty<T extends { average: number }>(rows: readonly T[]): T[] {
  const first = rows.findIndex((r) => r.average > 0);
  return first < 0 ? [] : rows.slice(first);
}
