/**
 * First-weeks ramp of the weekly active minutes (owner 27.10.2026, adherence-and-goals.md). Pure
 * (__tests__/activeMinutesRamp.test.ts).
 *
 * - Levels 1 to 5 start small: 75 (level 1) to 90 (level 5) minutes in week 1, brisk walking
 *   included (2 to 3 strength sessions of 15 to 20 minutes + walking).
 * - Then +10% to 20% a week, reaching the WHO 150 by week 7 (inside the owner's 6 to 8 weeks).
 * - No raise after a weak week: the target holds.
 * - Level 6 and up get the full 150 from week 1, and their chosen session length as is.
 */

export const WHO_WEEKLY_ACTIVE_MINUTES = 150;
/** The highest level that ramps; 6+ get the full target from week 1. */
export const RAMP_MAX_LEVEL = 5;
export const RAMP_START_MINUTES_MIN = 75;
export const RAMP_START_MINUTES_MAX = 90;
/** The week (0 based) the ramp reaches 150 when no week was weak. */
export const RAMP_FULL_AT_WEEK = 6;
export const RAMP_RATE_MIN = 0.1;
export const RAMP_RATE_MAX = 0.2;
/** Week-1 strength session cap: 15 minutes for levels 1 and 2, 20 for 3 to 5. */
export const RAMP_WEEK1_SESSION_EASY = 15;
export const RAMP_WEEK1_SESSION = 20;
/** A week counts as weak below this share of its target. */
export const WEAK_WEEK_SHARE = 0.7;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const validLevel = (level: number) => (Number.isFinite(level) && level > 0 ? Math.floor(level) : 1);

export const ramps = (level: number): boolean => validLevel(level) <= RAMP_MAX_LEVEL;

/** Week-1 minutes for a level (1..5 → 75..90). */
export function rampStartMinutes(level: number): number {
  const l = clamp(validLevel(level), 1, RAMP_MAX_LEVEL);
  const share = (l - 1) / (RAMP_MAX_LEVEL - 1);
  return Math.round(RAMP_START_MINUTES_MIN + share * (RAMP_START_MINUTES_MAX - RAMP_START_MINUTES_MIN));
}

/** The weekly growth that reaches 150 by RAMP_FULL_AT_WEEK, kept within 10% to 20%. */
export function rampRate(start: number): number {
  const r = Math.pow(WHO_WEEKLY_ACTIVE_MINUTES / start, 1 / RAMP_FULL_AT_WEEK) - 1;
  return clamp(r, RAMP_RATE_MIN, RAMP_RATE_MAX);
}

export interface RampInput {
  /** The user's strength level (computeBaseLevel). */
  level: number;
  /** Weeks since the program started, 0 = the first week. */
  weekIndex: number;
  /** Weeks (0 based, before weekIndex) the user was weak in, when known. */
  weakWeeks?: readonly number[];
}

/** The week's active-minutes target (strength + run + brisk walking). */
export function weeklyActiveTarget(i: RampInput): number {
  if (!ramps(i.level)) return WHO_WEEKLY_ACTIVE_MINUTES;
  const start = rampStartMinutes(i.level);
  const rate = rampRate(start);
  const weak = new Set(i.weakWeeks ?? []);
  const weeks = Math.max(0, Math.floor(Number.isFinite(i.weekIndex) ? i.weekIndex : 0));
  let target = start;
  for (let w = 1; w <= weeks && target < WHO_WEEKLY_ACTIVE_MINUTES; w++) {
    if (weak.has(w - 1)) continue;
    target = Math.min(WHO_WEEKLY_ACTIVE_MINUTES, Math.round(target * (1 + rate)));
  }
  return target;
}

/** A week was weak when its actual active minutes stayed below 70% of its target. */
export const isWeakWeek = (actualMinutes: number, target: number): boolean =>
  target > 0 && actualMinutes < target * WEAK_WEEK_SHARE;

/**
 * The strength session length for this week: the user's choice, capped while the ramp runs
 * (15 or 20 minutes in week 1, growing with the target, on the 5-minute grid).
 */
export function rampSessionMinutes(chosen: number, i: RampInput): number {
  const pick = Number.isFinite(chosen) && chosen > 0 ? chosen : RAMP_WEEK1_SESSION;
  if (!ramps(i.level)) return pick;
  const week1 = validLevel(i.level) <= 2 ? RAMP_WEEK1_SESSION_EASY : RAMP_WEEK1_SESSION;
  const scaled = Math.round((week1 * weeklyActiveTarget(i)) / rampStartMinutes(i.level) / 5) * 5;
  return Math.min(pick, Math.max(week1, scaled));
}

/** The walking minutes that fill the target after the planned sessions (never negative). */
export const walkMinutesToTarget = (target: number, planned: number): number => Math.max(0, Math.round(target - planned));

/** Whole weeks from the program start to `now` (0 in the first week, 0 when unknown or ahead). */
export function weekIndexFrom(start: Date | null | undefined, now: Date): number {
  if (!start || Number.isNaN(start.getTime())) return 0;
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? Math.floor(days / 7) : 0;
}
