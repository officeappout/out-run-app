/**
 * Streak rules — pure, dependency-free helpers (unit-testable without
 * Firebase / Zustand).
 *
 * A day counts toward the streak when EITHER:
 *   1. minutes rule — the day's combined active minutes (all categories)
 *      reach STREAK_MINIMUM_MINUTES (10), or
 *   2. steps rule  — the day's steps reach the day's step goal
 *      (owner decision, Oct 2026).
 *
 * The goal used by the steps rule is the same one the home screen shows
 * the user: `dailyActivity.stepsGoal`, which for TODAY the activity store
 * stamps with the user's ONE resolved goal (lib/step-goal.ts — adaptive or
 * manual, the same goal the evening push uses) and which stays as that
 * day's snapshot afterwards. Falls back to DAILY_STEP_GOAL when a doc was
 * created by the ingestHealthSamples Cloud Function and never got a
 * stepsGoal field.
 *
 * A day is counted at most once: `lastStreakDate === today` is the
 * idempotency key shared by both rules (see advanceStreakForDay).
 */
import {
  dayActiveMinutes,
  dayClosedByMinutes,
  dayClosedBySteps,
  dayStepGoal,
  isDayClosed,
} from './streak-day.core';

/** Minimal shape of a day the rules need (a DailyActivity satisfies it). */
export interface StreakDayInput {
  categories: Record<string, { minutes: number } | undefined>;
  steps?: number;
  stepsGoal?: number;
}

// The day rules live in streak-day.core.ts (import-free, mirrored to Cloud Functions so the
// server's "is today closed?" is the same code). These names stay for existing callers.
export function totalActiveMinutes(day: StreakDayInput): number {
  return dayActiveMinutes(day);
}

/** The step goal the user sees for this day. */
export function effectiveStepsGoal(day: Pick<StreakDayInput, 'stepsGoal'>): number {
  return dayStepGoal(day);
}

export function dayQualifiesByMinutes(day: StreakDayInput): boolean {
  return dayClosedByMinutes(day);
}

export function dayQualifiesBySteps(day: StreakDayInput): boolean {
  return dayClosedBySteps(day);
}

export function dayQualifiesForStreak(day: StreakDayInput): boolean {
  return isDayClosed(day);
}

export interface StreakCounters {
  currentStreak: number;
  lastStreakDate: string;
}

/**
 * Count `todayStr` toward the streak. Same policy the store has always used
 * for the minutes path:
 *   - lastStreakDate === today  → no-op (already counted today)
 *   - gap of more than one day  → restart at 1
 *   - yesterday                 → +1
 *   - no prior date             → 1
 * Dates are 'YYYY-MM-DD' local-day strings (toLocalDayString); both parse as
 * UTC midnight, so the difference is an exact whole number of days.
 */
export function advanceStreakForDay(
  counters: StreakCounters,
  todayStr: string,
): StreakCounters & { advanced: boolean } {
  const { currentStreak, lastStreakDate } = counters;
  if (lastStreakDate === todayStr) {
    return { currentStreak, lastStreakDate, advanced: false };
  }
  let next: number;
  if (lastStreakDate) {
    const daysDiff = Math.floor(
      (new Date(todayStr).getTime() - new Date(lastStreakDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    next = daysDiff > 1 ? 1 : currentStreak + 1;
  } else {
    next = 1;
  }
  return { currentStreak: next, lastStreakDate: todayStr, advanced: true };
}

// ── Calm return: one automatic grace day per week (CALM_RETURN_V1) ─────────
//
// A single missed day no longer breaks the streak: once per calendar week
// (Sun–Sat, the week of the MISSED day) the gap of exactly one day is bridged
// automatically — "יום חסד". The grace day counts as a streak day (N → N+2 on
// the day the user comes back). That is deliberate: the streaks/{uid} rule only
// accepts +1 advances of exactly one calendar day, so the store bridges the gap
// with two such writes (N+1 on the grace day, N+2 today) and needs no rules
// change. Only active behind the panel flag enable_calm_return_v1; the store
// keeps calling advanceStreakForDay unchanged while it is off.

/** 'YYYY-MM-DD' of the Sunday that starts the week of `dayStr` (also 'YYYY-MM-DD'). */
export function streakWeekKey(dayStr: string): string {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function dayDiff(fromStr: string, toStr: string): number {
  return Math.floor((new Date(toStr).getTime() - new Date(fromStr).getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dayStr: string, n: number): string {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface GraceStreakCounters extends StreakCounters {
  /** streakWeekKey of the week whose grace day was already used ('' / undefined = none). */
  graceWeekKey?: string;
}

/**
 * The single missed day between `lastStreakDate` and `todayStr` that a grace day can
 * cover, or null (no gap, a longer gap, no streak, or the grace of that week is used).
 */
export function graceDayFor(counters: GraceStreakCounters, todayStr: string): string | null {
  const { currentStreak, lastStreakDate, graceWeekKey } = counters;
  if (!lastStreakDate || currentStreak <= 0) return null;
  if (dayDiff(lastStreakDate, todayStr) !== 2) return null;
  const missed = addDays(lastStreakDate, 1);
  return graceWeekKey === streakWeekKey(missed) ? null : missed;
}

/** On load: is a streak whose last counted day is `lastStreakDate` still alive today? */
export function isStreakAliveWithGrace(counters: GraceStreakCounters, todayStr: string): boolean {
  if (!counters.lastStreakDate) return false;
  const diff = dayDiff(counters.lastStreakDate, todayStr);
  if (diff <= 1) return true;
  return graceDayFor(counters, todayStr) !== null;
}

/**
 * advanceStreakForDay + the weekly grace day. Same result as advanceStreakForDay unless a
 * grace day bridges a one-day gap: then the streak continues (+2: the grace day and today)
 * and `graceDate` / `graceWeekKey` say which day was covered.
 */
export function advanceStreakForDayWithGrace(
  counters: GraceStreakCounters,
  todayStr: string,
): StreakCounters & { advanced: boolean; graceDate: string | null; graceWeekKey: string | undefined } {
  const grace = counters.lastStreakDate !== todayStr ? graceDayFor(counters, todayStr) : null;
  if (grace) {
    return {
      currentStreak: counters.currentStreak + 2,
      lastStreakDate: todayStr,
      advanced: true,
      graceDate: grace,
      graceWeekKey: streakWeekKey(grace),
    };
  }
  return { ...advanceStreakForDay(counters, todayStr), graceDate: null, graceWeekKey: counters.graceWeekKey };
}
