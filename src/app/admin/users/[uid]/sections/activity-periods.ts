import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

/** The three lines the owner compares (01.11): running, strength, walking. */
export type ActivityKind = 'running' | 'strength' | 'walking';
export const ACTIVITY_KINDS: ActivityKind[] = ['running', 'strength', 'walking'];

export type ActivityPeriod = 'week' | 'month' | 'year';

type Entry = Pick<WorkoutHistoryEntry, 'date' | 'workoutType' | 'activityType' | 'duration' | 'distance' | 'setsCompleted' | 'segments'>;

export interface PeriodTotals {
  minutes: number;
  sessions: number;
  km: number;
  sets: number;
}

export interface PeriodPoint extends Record<ActivityKind, number> {
  label: string;
}

export interface PeriodComparison {
  points: PeriodPoint[];
  current: PeriodTotals;
  previous: PeriodTotals;
}

/**
 * Strength covers the legacy 'workout' activity type, hybrid and recovery
 * sessions; cycling rides with running (both are distance cardio).
 */
export function activityKind(w: Pick<Entry, 'workoutType' | 'activityType'>): ActivityKind {
  if (w.workoutType === 'walking' || w.activityType === 'walking') return 'walking';
  if (w.activityType === 'workout' || w.activityType === 'strength') return 'strength';
  if (w.workoutType === 'running' || w.workoutType === 'cycling') return 'running';
  return 'strength';
}

/** setsCompleted when stored, else the logged sets of the strength segment. */
export function workoutSets(w: Pick<Entry, 'setsCompleted' | 'segments'>): number {
  if (typeof w.setsCompleted === 'number') return w.setsCompleted;
  const log = (w.segments?.[0] as { actual?: { exerciseLog?: Array<{ confirmedReps?: unknown[] }> } } | undefined)?.actual?.exerciseLog;
  return Array.isArray(log) ? log.reduce((n, ex) => n + (Array.isArray(ex.confirmedReps) ? ex.confirmedReps.length : 0), 0) : 0;
}

interface Bucket { start: Date; end: Date; label: string }

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Day buckets for week (7) and month (30), month buckets for year (12); oldest first. */
function buckets(period: ActivityPeriod, now: Date, offset: number): Bucket[] {
  const out: Bucket[] = [];
  if (period === 'year') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i - 12 * offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      out.push({ start, end, label: start.toLocaleDateString('he-IL', { month: 'short' }) });
    }
    return out;
  }
  const days = period === 'week' ? 7 : 30;
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(start.getDate() - i - days * offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    out.push({ start, end, label: start.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) });
  }
  return out;
}

function totals(list: Entry[]): PeriodTotals {
  return list.reduce<PeriodTotals>(
    (t, w) => ({
      minutes: t.minutes + (w.duration || 0) / 60,
      sessions: t.sessions + 1,
      km: t.km + (activityKind(w) === 'strength' ? 0 : w.distance || 0),
      sets: t.sets + workoutSets(w),
    }),
    { minutes: 0, sessions: 0, km: 0, sets: 0 },
  );
}

function inRange(list: Entry[], range: Bucket[]): Entry[] {
  const from = range[0].start.getTime();
  const to = range[range.length - 1].end.getTime();
  return list.filter((w) => w.date.getTime() >= from && w.date.getTime() < to);
}

/** Minutes per bucket stacked by kind, plus this period's and the previous period's totals. */
export function comparePeriods(list: Entry[], period: ActivityPeriod, now: Date = new Date()): PeriodComparison {
  const cur = buckets(period, now, 0);
  const prev = buckets(period, now, 1);
  const points = cur.map((b) => {
    const p: PeriodPoint = { label: b.label, running: 0, strength: 0, walking: 0 };
    for (const w of list) {
      const t = w.date.getTime();
      if (t >= b.start.getTime() && t < b.end.getTime()) p[activityKind(w)] += (w.duration || 0) / 60;
    }
    ACTIVITY_KINDS.forEach((k) => { p[k] = Math.round(p[k]); });
    return p;
  });
  return { points, current: totals(inRange(list, cur)), previous: totals(inRange(list, prev)) };
}

/** Whole-percent change, null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
