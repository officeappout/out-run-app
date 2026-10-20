/**
 * P-1c summary card — the small per-day (week) / per-week (month) bars next to
 * each secondary number, and the activity split for the ring. Pure.
 */
import type { ProgressDay, ProgressWorkout } from './progress-model';
import type { DayRange, PeriodSummary, ProgressPeriod } from './progress-period';

export interface PeriodSpark {
  workouts: number[];
  km: number[];
  steps: number[];
  /** Bucket of today (the highlighted bar); buckets after it are in the future. */
  todayIndex: number;
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Week → 7 buckets Sunday…Saturday. Month → one bucket per calendar row
 * (Sunday-start weeks) of the month, so ≤ 6 bars instead of 31.
 */
export function periodSpark(period: ProgressPeriod, range: DayRange, workouts: ProgressWorkout[], days: ProgressDay[], now: Date): PeriodSpark {
  const start = midnight(range.start);
  const lead = period === 'month' ? start.getDay() : 0;
  const bucketOf = (d: Date) => {
    const offset = Math.round((midnight(d).getTime() - start.getTime()) / 86_400_000);
    return period === 'week' ? offset : Math.floor((offset + lead) / 7);
  };
  const count =
    period === 'week'
      ? 7
      : Math.ceil((lead + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()) / 7);
  const workoutsB = new Array<number>(count).fill(0);
  const kmB = new Array<number>(count).fill(0);
  const stepsB = new Array<number>(count).fill(0);
  for (const w of workouts) {
    if (w.date < range.start || w.date >= range.end) continue;
    const i = bucketOf(w.date);
    if (i < 0 || i >= count) continue;
    workoutsB[i] += 1;
    if (w.kind === 'run' || w.kind === 'walk' || w.type === 'hybrid') kmB[i] += w.km;
  }
  for (const d of days) {
    if (d.date < range.startISO || d.date > range.endISO) continue;
    const [y, m, dd] = d.date.split('-').map(Number);
    const i = bucketOf(new Date(y, m - 1, dd));
    if (i >= 0 && i < count) stepsB[i] += d.steps;
  }
  return { workouts: workoutsB, km: kmB.map((v) => Math.round(v * 10) / 10), steps: stepsB, todayIndex: Math.min(count - 1, bucketOf(now)) };
}

export type SplitKind = 'strength' | 'run' | 'walk';

/** Minutes per activity for the ring, biggest first; kinds with no minutes are left out. */
export function activitySplit(summary: PeriodSummary): { kind: SplitKind; minutes: number; count: number }[] {
  return (['strength', 'run', 'walk'] as const)
    .map((kind) => ({ kind, minutes: Math.round(summary.byKind[kind].minutes), count: summary.byKind[kind].count }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}
