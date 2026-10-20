/**
 * Progress tab v2 — chart series and per-activity stats (boards P-2a–d).
 * Pure; every input is an already-bounded list (≤ 40 workouts / 30 days).
 */
import type { BarDatum } from '@/components/ui/v2/logic';
import type { ProgressDay, ProgressWorkout } from './progress-model';
import { periodRanges, inRange, toISODate, round1, type DayRange } from './progress-period';

export type WeeklyMetric = 'km' | 'minutes' | 'sets';

function sundayOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

/** The last `weeks` Sunday-weeks (oldest first); the current one is keyed "now". */
export function weeklySeries(workouts: ProgressWorkout[], metric: WeeklyMetric, now: Date, weeks = 8): BarDatum[] {
  const thisSunday = sundayOf(now);
  const out: BarDatum[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisSunday.getFullYear(), thisSunday.getMonth(), thisSunday.getDate() - i * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    let v = 0;
    for (const w of workouts) {
      if (w.date >= start && w.date < end) v += metric === 'km' ? w.km : metric === 'minutes' ? w.minutes : w.sets;
    }
    out.push({
      key: i === 0 ? 'now' : toISODate(start),
      label: i === 0 ? 'השבוע' : `${start.getDate()}/${start.getMonth() + 1}`,
      value: metric === 'km' ? round1(v) : Math.round(v),
    });
  }
  return out;
}

/**
 * Pace trend (P-2a): plotted as speed so "up = faster"; `paceOf` turns a
 * plotted value back into min/km for the label.
 */
export function paceSeries(runs: ProgressWorkout[], n = 10): BarDatum[] {
  return runs
    .filter((r) => r.pace > 2 && r.pace < 20)
    .slice(-n)
    .map((r) => ({ key: r.id, label: `${r.date.getDate()}/${r.date.getMonth() + 1}`, value: Math.round((60 / r.pace) * 100) / 100 }));
}

export function paceOf(speedKmh: number): number {
  return speedKmh > 0 ? 60 / speedKmh : 0;
}

export interface KindPeriodStats {
  count: number;
  km: number;
  minutes: number;
  /** Distance-weighted average pace, min/km (0 = none). */
  pace: number;
  sets: number;
}

export function kindStats(workouts: ProgressWorkout[], r: DayRange): KindPeriodStats {
  let count = 0;
  let km = 0;
  let minutes = 0;
  let sets = 0;
  let paceKm = 0;
  let paceMin = 0;
  for (const w of workouts) {
    if (!inRange(w.date, r)) continue;
    count += 1;
    km += w.km;
    minutes += w.minutes;
    sets += w.sets;
    if (w.km > 0 && w.pace > 0) {
      paceKm += w.km;
      paceMin += w.pace * w.km;
    }
  }
  return { count, km: round1(km), minutes: Math.round(minutes), pace: paceKm > 0 ? paceMin / paceKm : 0, sets };
}

/** This month vs the previous month at the same stage, from one bounded recent list. */
export function monthCompare(workouts: ProgressWorkout[], now: Date): { current: KindPeriodStats; previous: KindPeriodStats } {
  const r = periodRanges('month', now);
  return { current: kindStats(workouts, r.current), previous: kindStats(workouts, r.previous) };
}

export function weekCompare(workouts: ProgressWorkout[], now: Date): { current: KindPeriodStats; previous: KindPeriodStats } {
  const r = periodRanges('week', now);
  return { current: kindStats(workouts, r.current), previous: kindStats(workouts, r.previous) };
}

const DOMAIN_HE: Record<string, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'בטן',
  upper_body: 'פלג גוף עליון',
  lower_body: 'פלג גוף תחתון',
};

export interface DomainRow {
  domain: string;
  label: string;
  sets: number;
}

/** Sets per muscle group this week (only docs saved with exerciseLog.domain). */
export function domainBreakdown(workouts: ProgressWorkout[], now: Date): DomainRow[] {
  const r = periodRanges('week', now).current;
  const acc: Record<string, number> = {};
  for (const w of workouts) {
    if (!inRange(w.date, r)) continue;
    for (const [d, n] of Object.entries(w.domainSets)) acc[d] = (acc[d] ?? 0) + n;
  }
  return Object.entries(acc)
    .map(([domain, sets]) => ({ domain, label: DOMAIN_HE[domain] ?? domain, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export interface StepsStats {
  weekAvg: number;
  prevWeekAvg: number | null;
  today: number;
  goal: number;
  best: { steps: number; date: string } | null;
  daysInGoal: number;
  daysCounted: number;
  goalStreak: number;
  weekKm: number;
  chart: BarDatum[];
}

/** P-2d — from ≤ 30 dailyActivity docs (oldest → newest). */
export function stepsStats(days: ProgressDay[], now: Date, fallbackGoal: number): StepsStats {
  const todayISO = toISODate(now);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const { current, previous } = periodRanges('week', now);
  const inR = (r: DayRange) => sorted.filter((d) => d.date >= r.startISO && d.date <= r.endISO);
  const cur = inR(current);
  const prev = inR(previous);
  const avg = (xs: ProgressDay[]) => (xs.length ? Math.round(xs.reduce((s, d) => s + d.steps, 0) / xs.length) : 0);
  const todayDoc = sorted.find((d) => d.date === todayISO);
  const goal = todayDoc?.stepsGoal || sorted[sorted.length - 1]?.stepsGoal || fallbackGoal;
  let best: StepsStats['best'] = null;
  for (const d of sorted) if (d.steps > 0 && (!best || d.steps > best.steps)) best = { steps: d.steps, date: d.date };
  let goalStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i];
    const met = d.steps >= (d.stepsGoal || goal);
    if (d.date === todayISO && !met) continue; // today still in progress
    if (!met) break;
    goalStreak += 1;
  }
  return {
    weekAvg: avg(cur),
    prevWeekAvg: prev.length ? avg(prev) : null,
    today: todayDoc?.steps ?? 0,
    goal,
    best,
    daysInGoal: cur.filter((d) => d.steps >= (d.stepsGoal || goal)).length,
    daysCounted: cur.length,
    goalStreak,
    weekKm: round1(cur.reduce((s, d) => s + d.distanceMeters, 0) / 1000),
    chart: sorted.map((d) => ({ key: d.date, label: `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}`, value: d.steps })),
  };
}
