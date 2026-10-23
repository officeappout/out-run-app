/**
 * Running page (hub v2, PG-3) — pure shapes. The plan comes from
 * running.activeProgram (schedule, startDate, currentWeek); planned volume per
 * session is estimated by the loader (run-plan.loader.ts) from the same
 * templates the player materializes; done volume comes from the saved runs.
 */
import type { ProgressWorkout } from '../../utils/progress-model';
import type { VolumeDatum } from '../components/VolumeChart';

export type PhaseName = 'base' | 'build' | 'peak' | 'taper';

export interface PlanEntry {
  key: string;
  week: number;
  /** 1-based session number inside the week. */
  ordinal: number;
  name: string | null;
  category: string | null;
  status: 'pending' | 'completed' | 'skipped' | 'swapped';
  plannedMin: number | null;
  plannedKm: number | null;
}

export type WeekState = 'done' | 'current' | 'next' | 'ahead';

export interface PlanWeek {
  week: number;
  state: WeekState;
  phase: PhaseName | null;
  entries: PlanEntry[];
  plannedKm: number | null;
  plannedMin: number | null;
  completed: number;
  /** What was run in that calendar week of the plan. */
  actualKm: number;
  actualMin: number;
}

const DAY = 86400000;

export function weekStart(planStart: Date, week: number): Date {
  return new Date(planStart.getFullYear(), planStart.getMonth(), planStart.getDate() + (week - 1) * 7);
}

function sumOrNull(values: (number | null)[]): number | null {
  if (values.length === 0 || values.some((v) => v == null)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

/** Phase of a week from the program template's phases (null when unknown). */
export function phaseOf(week: number, phases: readonly { name: PhaseName; startWeek: number; endWeek: number }[] | null): PhaseName | null {
  return phases?.find((p) => week >= p.startWeek && week <= p.endWeek)?.name ?? null;
}

export function buildPlanWeeks(input: {
  entries: readonly PlanEntry[];
  weeks: number;
  currentWeek: number;
  planStart: Date;
  phases: readonly { name: PhaseName; startWeek: number; endWeek: number }[] | null;
  runs: readonly ProgressWorkout[];
}): PlanWeek[] {
  const out: PlanWeek[] = [];
  for (let w = 1; w <= input.weeks; w++) {
    const entries = input.entries.filter((e) => e.week === w).sort((a, b) => a.ordinal - b.ordinal);
    const from = weekStart(input.planStart, w).getTime();
    const to = from + 7 * DAY;
    const inWeek = input.runs.filter((r) => r.date.getTime() >= from && r.date.getTime() < to);
    out.push({
      week: w,
      state: w < input.currentWeek ? 'done' : w === input.currentWeek ? 'current' : w === input.currentWeek + 1 ? 'next' : 'ahead',
      phase: phaseOf(w, input.phases),
      entries,
      plannedKm: sumOrNull(entries.map((e) => e.plannedKm)),
      plannedMin: sumOrNull(entries.map((e) => e.plannedMin)),
      completed: entries.filter((e) => e.status === 'completed').length,
      actualKm: inWeek.reduce((s, r) => s + r.km, 0),
      actualMin: inWeek.reduce((s, r) => s + r.minutes, 0),
    });
  }
  return out;
}

export type VolumeUnit = 'km' | 'min';

/** Plan weeks → chart columns (done vs planned). At most 12 columns around the current week. */
export function planVolume(weeks: readonly PlanWeek[], unit: VolumeUnit): VolumeDatum[] {
  const cur = Math.max(0, weeks.findIndex((w) => w.state === 'current'));
  const from = Math.max(0, Math.min(cur - 5, weeks.length - 12));
  return weeks.slice(from, from + 12).map((w) => ({
    key: `w${w.week}`,
    label: String(w.week),
    done: round1(unit === 'km' ? w.actualKm : w.actualMin),
    planned: unit === 'km' ? w.plannedKm : w.plannedMin,
    current: w.state === 'current',
  }));
}

/** No plan → the last `n` calendar weeks (Sunday-based) of runs, done only. */
export function recentVolume(runs: readonly ProgressWorkout[], unit: VolumeUnit, now: Date, n = 8): VolumeDatum[] {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - (n - 1 - i) * 7);
    const end = start.getTime() + 7 * DAY;
    const inWeek = runs.filter((r) => r.date.getTime() >= start.getTime() && r.date.getTime() < end);
    return {
      key: `c${i}`,
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      done: round1(inWeek.reduce((s, r) => s + (unit === 'km' ? r.km : r.minutes), 0)),
      current: i === n - 1,
    };
  });
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface PlanTotals {
  km: number;
  minutes: number;
  runs: number;
  /** Sessions completed in the weeks before this one vs scheduled there. */
  onTrack: boolean;
  /** The last day of the plan. */
  endDate: Date;
}

export function planTotals(weeks: readonly PlanWeek[], planStart: Date, runsSinceStart: readonly ProgressWorkout[]): PlanTotals {
  const before = weeks.filter((w) => w.state === 'done');
  const due = before.reduce((s, w) => s + w.entries.length, 0);
  const done = before.reduce((s, w) => s + w.completed, 0);
  const end = weekStart(planStart, weeks.length + 1);
  return {
    km: round1(runsSinceStart.reduce((s, r) => s + r.km, 0)),
    minutes: Math.round(runsSinceStart.reduce((s, r) => s + r.minutes, 0)),
    runs: runsSinceStart.length,
    onTrack: done >= due,
    endDate: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1),
  };
}

/** Forecast for the main distance N days ago, from basePace history (oldest → newest; ≥ 2 points or []). */
export function forecastTrend(points: readonly { daysAgo: number; seconds: number | null }[]): { daysAgo: number; seconds: number }[] {
  const real = points.filter((p): p is { daysAgo: number; seconds: number } => p.seconds != null && p.seconds > 0);
  // A flat line says nothing — show the trend only when the forecast actually moved.
  return real.length >= 2 && new Set(real.map((p) => p.seconds)).size >= 2 ? [...real].sort((a, b) => b.daysAgo - a.daysAgo) : [];
}
