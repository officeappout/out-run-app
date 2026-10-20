/**
 * Progress tab v2 — week / month windows and their summaries (boards P-1a/b).
 *
 * "This week" = Sunday → today; "this month" = the 1st → today. Each is
 * compared with the previous week/month AT THE SAME STAGE (same number of
 * days), so a Tuesday never looks like a bad week next to a full one.
 * Pure — no React, no Firebase.
 */
import type { FlameTone } from '@/components/ui/v2/streak';
import { sessionKeyOf, type ProgressDay, type ProgressKind, type ProgressWorkout } from './progress-model';

export type ProgressPeriod = 'week' | 'month';

export interface DayRange {
  /** Inclusive, local midnight. */
  start: Date;
  /** Exclusive, local midnight of the day after the last day. */
  end: Date;
  startISO: string;
  /** Inclusive last day. */
  endISO: string;
}

export interface PeriodRanges {
  current: DayRange;
  previous: DayRange;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function range(start: Date, endInclusive: Date): DayRange {
  const end = addDays(endInclusive, 1);
  return { start, end, startISO: toISODate(start), endISO: toISODate(endInclusive) };
}

export function periodRanges(period: ProgressPeriod, now: Date): PeriodRanges {
  const today = midnight(now);
  if (period === 'week') {
    const start = addDays(today, -today.getDay());
    const elapsed = today.getDay();
    const prevStart = addDays(start, -7);
    return { current: range(start, today), previous: range(prevStart, addDays(prevStart, elapsed)) };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevLast = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(today.getDate(), prevLast));
  return { current: range(start, today), previous: range(prevStart, prevEnd) };
}

export function inRange(d: Date, r: DayRange): boolean {
  return d >= r.start && d < r.end;
}

export function isoInRange(iso: string, r: DayRange): boolean {
  return iso >= r.startISO && iso <= r.endISO;
}

export interface KindTotals {
  count: number;
  minutes: number;
  km: number;
  sets: number;
}

export interface PeriodSummary {
  workouts: number;
  minutes: number;
  /** Run + walk (+ hybrid run legs) kilometres. */
  km: number;
  steps: number;
  activeDays: number;
  byKind: Record<ProgressKind, KindTotals>;
}

const emptyKind = (): KindTotals => ({ count: 0, minutes: 0, km: 0, sets: 0 });

export function summarizePeriod(workouts: ProgressWorkout[], days: ProgressDay[], r: DayRange): PeriodSummary {
  const byKind: Record<ProgressKind, KindTotals> = {
    strength: emptyKind(),
    run: emptyKind(),
    walk: emptyKind(),
    other: emptyKind(),
  };
  const activeDates = new Set<string>();
  let minutes = 0;
  let km = 0;
  const sessions = new Set<string>();
  for (const w of workouts) {
    if (!inRange(w.date, r)) continue;
    sessions.add(sessionKeyOf(w)); // a combined workout's parts are ONE workout
    minutes += w.minutes;
    km += w.kind === 'run' || w.kind === 'walk' || w.type === 'hybrid' ? w.km : 0;
    const k = byKind[w.kind];
    k.count += 1;
    k.minutes += w.minutes;
    k.km += w.km;
    k.sets += w.sets;
    activeDates.add(toISODate(w.date));
  }
  let steps = 0;
  for (const d of days) {
    if (!isoInRange(d.date, r)) continue;
    steps += d.steps;
    if (d.activeMinutes > 0) activeDates.add(d.date);
  }
  return { workouts: sessions.size, minutes: Math.round(minutes), km: round1(km), steps, activeDays: activeDates.size, byKind };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const KIND_TONE: Record<ProgressKind, FlameTone | null> = {
  strength: 'strength',
  run: 'cardio',
  walk: 'steps',
  other: 'maintenance',
};

export interface ActivityDayCell {
  iso: string;
  dayOfMonth: number;
  /** 0 = Sunday. */
  weekday: number;
  tones: FlameTone[];
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
}

function cellsFor(start: Date, count: number, workouts: ProgressWorkout[], days: ProgressDay[], now: Date): ActivityDayCell[] {
  const todayISO = toISODate(now);
  const byDay = new Map<string, { tones: Set<FlameTone>; minutes: number }>();
  for (const w of workouts) {
    const iso = toISODate(w.date);
    const e = byDay.get(iso) ?? { tones: new Set<FlameTone>(), minutes: 0 };
    const tone = KIND_TONE[w.kind];
    if (tone) e.tones.add(tone);
    e.minutes += w.minutes;
    byDay.set(iso, e);
  }
  for (const d of days) {
    if (d.steps > 0 && d.stepsGoal > 0 && d.steps >= d.stepsGoal) {
      const e = byDay.get(d.date) ?? { tones: new Set<FlameTone>(), minutes: 0 };
      e.tones.add('steps');
      byDay.set(d.date, e);
    }
  }
  const order: FlameTone[] = ['strength', 'cardio', 'steps', 'maintenance'];
  return Array.from({ length: count }, (_, i) => {
    const d = addDays(start, i);
    const iso = toISODate(d);
    const e = byDay.get(iso);
    return {
      iso,
      dayOfMonth: d.getDate(),
      weekday: d.getDay(),
      tones: e ? order.filter((t) => e.tones.has(t)) : [],
      minutes: Math.round(e?.minutes ?? 0),
      isToday: iso === todayISO,
      isFuture: iso > todayISO,
    };
  });
}

/** Sunday → Saturday of the current week (P-1a strip). */
export function weekCells(workouts: ProgressWorkout[], days: ProgressDay[], now: Date): ActivityDayCell[] {
  const today = midnight(now);
  return cellsFor(addDays(today, -today.getDay()), 7, workouts, days, now);
}

/** Every day of the current month (P-1b calendar); `lead` = blank cells before the 1st. */
export function monthCells(workouts: ProgressWorkout[], days: ProgressDay[], now: Date): { lead: number; cells: ActivityDayCell[] } {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { lead: first.getDay(), cells: cellsFor(first, count, workouts, days, now) };
}

/** Longest run of consecutive active (non-future) cells. */
export function longestActiveRun(cells: ActivityDayCell[]): number {
  let best = 0;
  let cur = 0;
  for (const c of cells) {
    if (c.isFuture) break;
    cur = c.tones.length > 0 ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}
