/**
 * Progress hub v2 — the numbers on the main page's three domain cards (PG-2).
 * Pure: everything comes from data the tab already has (the period read, the
 * profile's progression / running plan, this week's schedule). No React.
 */
import type { ProgressDay } from '../../utils/progress-model';
import type { DayRange } from '../../utils/progress-period';
import { isoInRange, toISODate } from '../../utils/progress-period';
import type { RunningPlanProgress } from '../../utils/running-plan-progress';

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

// ── Strength ────────────────────────────────────────────────────────────────

export interface StrengthCardModel {
  programName: string;
  pct: number;
  level: number;
  maxLevel: number;
  /** % still missing to the next level; null at the top level. */
  toNext: number | null;
  nextLevel: number | null;
}

export function strengthCardModel(
  p: { programName: string; currentLevel: number; maxLevel: number; progressPercent: number } | null,
): StrengthCardModel | null {
  if (!p) return null;
  const pct = clampPct(p.progressPercent);
  const atTop = p.maxLevel > 0 && p.currentLevel >= p.maxLevel;
  return {
    programName: p.programName,
    pct,
    level: p.currentLevel,
    maxLevel: p.maxLevel,
    toNext: atTop ? null : 100 - pct,
    nextLevel: atTop ? null : p.currentLevel + 1,
  };
}

// ── Running plan ────────────────────────────────────────────────────────────

/** Plan ring = sessions done out of the whole plan. */
export function runPlanPct(plan: Pick<RunningPlanProgress, 'done' | 'total'> | null): number | null {
  if (!plan || !(plan.total > 0)) return null;
  return clampPct((plan.done / plan.total) * 100);
}

/** "5k" → 5, "10k" → 10, "maintenance" / unknown → null. */
export function planDistanceKm(distKey: string | null | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)k$/.exec(distKey ?? '');
  return m ? Number(m[1]) : null;
}

// ── Walking plan (schedule) ─────────────────────────────────────────────────

export interface WalkWeekModel {
  planned: number;
  done: number;
  pct: number;
}

/** This week's planned walks (schedule entries) and how many are completed. */
export function walkWeekModel(entries: readonly { completed?: boolean }[]): WalkWeekModel | null {
  if (entries.length === 0) return null;
  const done = entries.filter((e) => e.completed === true).length;
  return { planned: entries.length, done, pct: clampPct((done / entries.length) * 100) };
}

/** Sunday → Saturday of `now`'s week, YYYY-MM-DD. */
export function currentWeekDates(now: Date): string[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

// ── Steps ───────────────────────────────────────────────────────────────────

export interface StepsCardModel {
  today: number;
  goal: number;
  pct: number;
  /** Daily average over the days of the current period that have steps. */
  average: number;
  daysInGoal: number;
  daysCounted: number;
}

/** Today vs its goal + the period's average and days in goal (the period read's dailyActivity docs). */
export function stepsCardModel(days: readonly ProgressDay[], current: DayRange, now: Date, fallbackGoal: number): StepsCardModel | null {
  const inPeriod = days.filter((d) => isoInRange(d.date, current));
  const withSteps = inPeriod.filter((d) => d.steps > 0);
  if (withSteps.length === 0) return null;
  const todayISO = toISODate(now);
  const todayDoc = inPeriod.find((d) => d.date === todayISO);
  const today = todayDoc?.steps ?? 0;
  const goal = todayDoc?.stepsGoal || withSteps[withSteps.length - 1]?.stepsGoal || fallbackGoal;
  const total = withSteps.reduce((s, d) => s + d.steps, 0);
  return {
    today,
    goal,
    pct: goal > 0 ? clampPct((today / goal) * 100) : 0,
    average: Math.round(total / withSteps.length),
    daysInGoal: withSteps.filter((d) => d.steps >= (d.stepsGoal || goal)).length,
    daysCounted: elapsedDays(current.start, now),
  };
}

/** Days from `start` through `now`'s day, inclusive (≥ 1). */
export function elapsedDays(start: Date, now: Date): number {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
