/**
 * Pure derivations behind the Steps Analytics page — no React, no Firebase.
 *
 * Extracted verbatim from `useStepsAnalytics` (which still owns the fetch and
 * wraps these in `useMemo`) so the page can be rendered from fixtures in the
 * design-v2 preview route and the logic can be unit-tested in node.
 */

import type { DailyStepsSnapshot } from '../services/activity-history.service';
import { DAILY_STEP_GOAL } from '@/features/activity/config/health-goals.config';

export type StepsTimeRange = 'day' | 'week' | 'month' | 'year';

/** Single chart bar. */
export interface StepsChartPoint {
  /** X-axis label (short date or month name). */
  label: string;
  /** Aggregated step count for the bucket. */
  value: number;
  /** Whether the user met their goal for this bucket. */
  goalMet: boolean;
  /**
   * Stable bucket id — 'YYYY-MM-DD' for day buckets, 'YYYY-MM' for the year
   * view's month buckets. Used as the bar key / highlight key.
   */
  key: string;
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
  /** Effective daily goal (last known stepsGoal, or DAILY_STEP_GOAL default). */
  dailyGoal: number;
  /** Current consecutive-day streak (days ending today with steps > 0). */
  streak: number;
  /** Total real synced distance across the active range, in metres (0 if unsynced). */
  totalDistanceMeters: number;
}

const FALLBACK_GOAL = DAILY_STEP_GOAL;

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

/** Local-time 'YYYY-MM-DD' for a Date. */
export function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtShortDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr.slice(5);
  return `${HEBREW_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtMonthLabel(_year: number, monthZeroBased: number): string {
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
function bucketByMonth(snapshots: DailyStepsSnapshot[], now: Date): StepsChartPoint[] {
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
    key: `${b.year}-${String(b.month + 1).padStart(2, '0')}`,
  }));
}

export function deriveStepsChartData(
  snapshots: DailyStepsSnapshot[],
  timeRange: StepsTimeRange,
  now: Date = new Date(),
): StepsChartPoint[] {
  if (snapshots.length === 0) return [];

  if (timeRange === 'year') {
    return bucketByMonth(snapshots, now);
  }

  const days = RANGE_DAYS[timeRange];
  const window = takeLastN(snapshots, days);
  return window.map((s) => ({
    label: fmtShortDayLabel(s.date),
    value: s.steps,
    goalMet: s.stepsGoalMet,
    key: s.date,
  }));
}

export function deriveStepsStats(
  snapshots: DailyStepsSnapshot[],
  timeRange: StepsTimeRange,
): StepsAnalyticsStats {
  const last = snapshots[snapshots.length - 1];
  const dailyGoal = last?.stepsGoal && last.stepsGoal > 0 ? last.stepsGoal : FALLBACK_GOAL;

  let activeWindow: DailyStepsSnapshot[];
  if (timeRange === 'year') {
    activeWindow = snapshots; // up to a year
  } else {
    activeWindow = takeLastN(snapshots, RANGE_DAYS[timeRange]);
  }

  const totalSteps = activeWindow.reduce((sum, s) => sum + s.steps, 0);
  const totalDistanceMeters = activeWindow.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
  const daysWithData = activeWindow.filter((s) => s.steps > 0).length;
  const bestDay = activeWindow.reduce((mx, s) => (s.steps > mx ? s.steps : mx), 0);
  const daysAtGoal = activeWindow.filter((s) => s.stepsGoalMet).length;
  const averageDaily =
    daysWithData > 0 ? Math.round(totalSteps / daysWithData) : 0;

  // Streak: count consecutive days ending at the most recent snapshot with steps > 0
  let streak = 0;
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].steps > 0) streak++;
    else break;
  }

  return {
    todaySteps: last?.steps ?? 0,
    averageDaily,
    bestDay,
    totalSteps,
    daysAtGoal,
    daysWithData,
    dailyGoal,
    streak,
    totalDistanceMeters,
  };
}

// ── Design-v2 presentation helpers (pure, no new data) ─────────────────────

const HEBREW_DAY_NAMES_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** 'YYYY-MM-DD' shifted by `days` (local calendar arithmetic, DST-safe). */
export function shiftDateKey(dateKey: string, days: number): string | null {
  const d = new Date(dateKey + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/**
 * Steps on the same weekday one week before `dateKey`, looked up BY DATE in
 * the snapshots the page already loaded (snapshots can have gaps — a day with
 * no dailyActivity doc — so an index offset of 7 would be wrong).
 * Returns null when that day isn't in the loaded history; the DeltaBadge then
 * hides itself.
 */
export function sameDayLastWeekSteps(
  snapshots: DailyStepsSnapshot[],
  dateKey: string | null | undefined,
): number | null {
  if (!dateKey) return null;
  const target = shiftDateKey(dateKey, -7);
  if (!target) return null;
  const hit = snapshots.find((s) => s.date === target);
  return hit ? hit.steps : null;
}

/**
 * Tooltip heading for a chart bucket key: 'YYYY-MM-DD' → "יום חמישי · 15/10",
 * 'YYYY-MM' (year view) → "אוק׳ 2026".
 */
export function bucketTooltipLabel(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number);
    return `${HEBREW_MONTHS[m - 1] ?? m} ${y}`;
  }
  const d = new Date(key + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return key;
  return `יום ${HEBREW_DAY_NAMES_FULL[d.getDay()]} · ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Highlight key for "today/current" in the active range's chart. */
export function currentBucketKey(timeRange: StepsTimeRange, now: Date = new Date()): string {
  if (timeRange === 'year') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return toDateKey(now);
}
