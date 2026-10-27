/**
 * Step goal — the ONE resolver for a user's daily step goal.
 *
 * Used by the client (home steps ring / widgets, the streak's steps rule, the
 * step-deficit route card — all of which read `today.stepsGoal`, which the
 * activity store stamps with this resolver's result) AND by the server
 * (functions/src/stepGoalNudgeScheduler.ts and pushOutcomeSweeper.ts, via
 * functions/src/shared/step-goal.ts — a committed byte-for-byte mirror that
 * functions/scripts/vendor-copy-geo-discovery.js rewrites on every functions
 * build and lib/__tests__/step-goal.test.ts pins — so they can't drift).
 * After editing this file run `npm --prefix functions run build` (or copy it).
 *
 * KEEP THIS FILE IMPORT-FREE AND PURE: it is mirrored into Cloud Functions.
 *
 * ── Source of truth ─────────────────────────────────────────────────────────
 * `users/{uid}.progression`:
 *   - `dailyStepGoal`      the user's current goal (auto-computed or chosen)
 *   - `stepGoalMode`       'auto' (default when absent) | 'manual'
 *   - `stepGoalComputedOn` 'YYYY-MM-DD' of the last weekly auto recompute
 *
 * Why `progression.dailyStepGoal`: it already exists on every user doc, the
 * server nudge + push-outcome sweeper already read it, the admin user page
 * already shows it, and the client can write it (firestore.rules only lock
 * coins / globalLevel / globalXP inside `progression`). Its old value (3000,
 * the never-wired "Two-Speed" default — nothing ever recomputed it) is
 * ignored: an auto goal is only trusted when `stepGoalComputedOn` stamps it as
 * written by this resolver. `dailyActivity/{uid}_{date}.stepsGoal` stays as a
 * per-day SNAPSHOT of the resolved goal (history / charts / past-day streak).
 *
 * ── Auto (adaptive) goal ────────────────────────────────────────────────────
 *   target = clamp(round_to_500(median(steps of the last 14 days with data,
 *            today excluded) × 1.1), 4000, 12000);
 *   fewer than 5 days with data → target = 8000 (BASE_STEP_GOAL).
 * Recomputed at most once per 7 days; each recompute moves the goal by at
 * most ±1000 from the previous one. The first recompute starts from 8000 —
 * the goal every user has been shown on screen so far — so nobody's goal
 * jumps on the day this ships. No age / persona adjustment (not wired here:
 * age isn't on the user doc in a reliable form and persona would need the
 * alias map on both sides — a follow-up if wanted).
 */

export const BASE_STEP_GOAL = 8000;
export const AUTO_STEP_GOAL_MIN = 4000;
export const AUTO_STEP_GOAL_MAX = 12000;
export const MANUAL_STEP_GOAL_MIN = 2000;
export const MANUAL_STEP_GOAL_MAX = 20000;
export const STEP_GOAL_INCREMENT = 500;
export const STEP_GOAL_MAX_WEEKLY_CHANGE = 1000;
export const STEP_GOAL_RECOMPUTE_DAYS = 7;
export const STEP_GOAL_WINDOW_DAYS = 14;
export const STEP_GOAL_MIN_DAYS_WITH_DATA = 5;
export const STEP_GOAL_STRETCH = 1.1;

export type StepGoalMode = 'auto' | 'manual';

/** Raw `users/{uid}.progression` fields — untrusted, any shape. */
export interface StepGoalProgressionFields {
  dailyStepGoal?: unknown;
  stepGoalMode?: unknown;
  stepGoalComputedOn?: unknown;
  /** 'ramp_v1' = the gradual goal (schedule tutorial, owner 27.10.2026); absent = the adaptive goal above. */
  stepGoalPolicy?: unknown;
  /** The ramp's ceiling for this user (by age), written with the policy. */
  stepGoalCap?: unknown;
}

export interface StepDay {
  date: string; // 'YYYY-MM-DD'
  steps: number;
}

export interface ResolvedStepGoal {
  goal: number;
  mode: StepGoalMode;
  source: 'manual' | 'auto-stored' | 'auto-recomputed';
  /** True when the caller should write `persist` back to users/{uid}.progression. */
  shouldPersist: boolean;
  persist: { dailyStepGoal: number; stepGoalMode: StepGoalMode; stepGoalComputedOn: string } | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDateString(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

/** Whole days from `a` to `b` (both 'YYYY-MM-DD', parsed as UTC midnight). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** 'YYYY-MM-DD' shifted by `n` days (UTC arithmetic, no DST drift). */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
}

export function roundToIncrement(n: number): number {
  return Math.round(n / STEP_GOAL_INCREMENT) * STEP_GOAL_INCREMENT;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A user-chosen goal, snapped to the picker's 500 grid and range; null if not a number. */
export function sanitizeManualStepGoal(v: unknown): number | null {
  const n = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return clamp(roundToIncrement(n), MANUAL_STEP_GOAL_MIN, MANUAL_STEP_GOAL_MAX);
}

export function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Adaptive target from recent days: days strictly before `today`, within the
 * last STEP_GOAL_WINDOW_DAYS, with steps > 0 ("with data" — a 0 is almost
 * always "no health sync that day", not a real 0-step day). Duplicate dates:
 * the higher count wins. Null when there's too little data.
 */
export function adaptiveTargetFromDays(days: StepDay[], today: string): number | null {
  const byDate = new Map<string, number>();
  for (const d of days ?? []) {
    if (!d || !isDateString(d.date)) continue;
    const steps = Number(d.steps);
    if (!Number.isFinite(steps) || steps <= 0) continue;
    const age = daysBetween(d.date, today);
    if (age < 1 || age > STEP_GOAL_WINDOW_DAYS) continue;
    byDate.set(d.date, Math.max(byDate.get(d.date) ?? 0, steps));
  }
  if (byDate.size < STEP_GOAL_MIN_DAYS_WITH_DATA) return null;
  const raw = roundToIncrement(median(Array.from(byDate.values())) * STEP_GOAL_STRETCH);
  return clamp(raw, AUTO_STEP_GOAL_MIN, AUTO_STEP_GOAL_MAX);
}

/**
 * Resolve the user's step goal for `today`.
 *
 * @param progression raw users/{uid}.progression (or {} when absent)
 * @param recentDays  dailyActivity steps for (at least) the last 14 days; only
 *                    needed when an auto recompute is due — pass [] otherwise
 * @param today       'YYYY-MM-DD' (client local day / server Israel day)
 */
export function resolveStepGoal(
  progression: StepGoalProgressionFields | null | undefined,
  recentDays: StepDay[],
  today: string,
): ResolvedStepGoal {
  const p = progression ?? {};

  if (p.stepGoalMode === 'manual') {
    const manual = sanitizeManualStepGoal(p.dailyStepGoal);
    if (manual != null) {
      return { goal: manual, mode: 'manual', source: 'manual', shouldPersist: false, persist: null };
    }
    // A manual mode without a usable number falls through to auto.
  }

  if (p.stepGoalPolicy === STEP_RAMP_POLICY) return resolveRampStepGoal(p, recentDays, today);

  const computedOn = isDateString(p.stepGoalComputedOn) ? p.stepGoalComputedOn : null;
  const storedRaw = Number(p.dailyStepGoal);
  const stored =
    computedOn && typeof p.dailyStepGoal === 'number' && Number.isFinite(storedRaw) && storedRaw > 0
      ? clamp(roundToIncrement(storedRaw), AUTO_STEP_GOAL_MIN, AUTO_STEP_GOAL_MAX)
      : null;

  // A stamp "in the future" (device clock / timezone skew vs the server's
  // Israel day) counts as fresh — never recompute twice across the boundary.
  if (stored != null && computedOn && daysBetween(computedOn, today) < STEP_GOAL_RECOMPUTE_DAYS) {
    return { goal: stored, mode: 'auto', source: 'auto-stored', shouldPersist: false, persist: null };
  }

  const previous = stored ?? BASE_STEP_GOAL;
  const target = adaptiveTargetFromDays(recentDays, today) ?? BASE_STEP_GOAL;
  const step = clamp(target - previous, -STEP_GOAL_MAX_WEEKLY_CHANGE, STEP_GOAL_MAX_WEEKLY_CHANGE);
  const goal = clamp(roundToIncrement(previous + step), AUTO_STEP_GOAL_MIN, AUTO_STEP_GOAL_MAX);

  return {
    goal,
    mode: 'auto',
    source: 'auto-recomputed',
    shouldPersist: true,
    persist: { dailyStepGoal: goal, stepGoalMode: 'auto', stepGoalComputedOn: today },
  };
}

/** True when resolveStepGoal will need recent days (so callers can skip the read). */
export function stepGoalNeedsRecentDays(
  progression: StepGoalProgressionFields | null | undefined,
  today: string,
): boolean {
  return resolveStepGoal(progression, [], today).source === 'auto-recomputed';
}

// ── Gradual goal (stepGoalPolicy 'ramp_v1', owner 27.10.2026, adherence-and-goals.md) ──
//   start  = the personal baseline (average of the last 14 days with data) + 500..1,000
//            (rounded UP to the 500 grid), or 4,000 with fewer than 3 days of data;
//   weekly = +500 (+1,000 when the goal was met on 5+ of the last 7 days), never after a
//            weak week (goal met on fewer than 3 of the last 7 days, or no data);
//   cap    = stepGoalCap (by age: 7,000 for 60+, 9,000 younger). Never lowered here.
// Only users the schedule tutorial put on it carry the policy; everyone else is unchanged.

export const STEP_RAMP_POLICY = 'ramp_v1';
export const STEP_RAMP_NO_DATA_GOAL = 4000;
export const STEP_RAMP_MIN_DAYS_WITH_DATA = 3;
export const STEP_RAMP_BASELINE_BUMP = 500;
export const STEP_RAMP_RAISE = 500;
export const STEP_RAMP_STRONG_RAISE = 1000;
export const STEP_RAMP_WEEK_DAYS = 7;
export const STEP_RAMP_WEAK_BELOW_DAYS = 3;
export const STEP_RAMP_STRONG_FROM_DAYS = 5;
export const STEP_RAMP_CAP_60_PLUS = 7000;
export const STEP_RAMP_CAP_YOUNGER = 9000;

/** The ramp's ceiling for an age in years (unknown age = the younger cap). */
export function stepRampCapForAge(age: number | null | undefined): number {
  return typeof age === 'number' && Number.isFinite(age) && age >= 60 ? STEP_RAMP_CAP_60_PLUS : STEP_RAMP_CAP_YOUNGER;
}

function rampCapOf(v: unknown): number {
  const n = Number(v);
  return typeof v === 'number' && Number.isFinite(n) && n > 0
    ? clamp(roundToIncrement(n), MANUAL_STEP_GOAL_MIN, AUTO_STEP_GOAL_MAX)
    : STEP_RAMP_CAP_YOUNGER;
}

/** Days strictly before `today` and at most `window` days back, steps > 0, one per date (the higher). */
function stepsByDate(days: StepDay[], today: string, window: number): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const d of days ?? []) {
    if (!d || !isDateString(d.date)) continue;
    const steps = Number(d.steps);
    if (!Number.isFinite(steps) || steps <= 0) continue;
    const age = daysBetween(d.date, today);
    if (age < 1 || age > window) continue;
    byDate.set(d.date, Math.max(byDate.get(d.date) ?? 0, steps));
  }
  return byDate;
}

/** The first goal: baseline + 500..1,000 on the 500 grid, else 4,000; within [2,000, cap]. */
export function rampStartStepGoal(days: StepDay[], today: string, cap: number): number {
  const byDate = stepsByDate(days, today, STEP_GOAL_WINDOW_DAYS);
  const top = rampCapOf(cap);
  if (byDate.size < STEP_RAMP_MIN_DAYS_WITH_DATA) return Math.min(STEP_RAMP_NO_DATA_GOAL, top);
  const values = Array.from(byDate.values());
  const avg = values.reduce((n, v) => n + v, 0) / values.length;
  const start = Math.ceil((avg + STEP_RAMP_BASELINE_BUMP) / STEP_GOAL_INCREMENT) * STEP_GOAL_INCREMENT;
  return clamp(start, MANUAL_STEP_GOAL_MIN, top);
}

/** The weekly step: 0 after a weak week, +500, or +1,000 after a strong one. */
export function rampWeeklyRaise(days: StepDay[], today: string, goal: number): number {
  const met = Array.from(stepsByDate(days, today, STEP_RAMP_WEEK_DAYS).values()).filter((s) => s >= goal).length;
  if (met < STEP_RAMP_WEAK_BELOW_DAYS) return 0;
  return met >= STEP_RAMP_STRONG_FROM_DAYS ? STEP_RAMP_STRONG_RAISE : STEP_RAMP_RAISE;
}

function resolveRampStepGoal(p: StepGoalProgressionFields, recentDays: StepDay[], today: string): ResolvedStepGoal {
  const cap = rampCapOf(p.stepGoalCap);
  const computedOn = isDateString(p.stepGoalComputedOn) ? p.stepGoalComputedOn : null;
  const storedRaw = Number(p.dailyStepGoal);
  const stored =
    computedOn && typeof p.dailyStepGoal === 'number' && Number.isFinite(storedRaw) && storedRaw > 0
      ? clamp(roundToIncrement(storedRaw), MANUAL_STEP_GOAL_MIN, AUTO_STEP_GOAL_MAX)
      : null;
  if (stored != null && computedOn && daysBetween(computedOn, today) < STEP_GOAL_RECOMPUTE_DAYS) {
    return { goal: stored, mode: 'auto', source: 'auto-stored', shouldPersist: false, persist: null };
  }
  const goal = stored == null
    ? rampStartStepGoal(recentDays, today, cap)
    : Math.max(stored, Math.min(cap, stored + rampWeeklyRaise(recentDays, today, stored)));
  return {
    goal,
    mode: 'auto',
    source: 'auto-recomputed',
    shouldPersist: true,
    persist: { dailyStepGoal: goal, stepGoalMode: 'auto', stepGoalComputedOn: today },
  };
}
