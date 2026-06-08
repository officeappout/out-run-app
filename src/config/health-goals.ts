/**
 * Health Goals — single source of truth for step/floor display goals.
 *
 * Scope note: this file owns the *display / fallback* daily step goal used by
 * widgets, rings, charts, and the daily-activity document. It is intentionally
 * separate from the *adaptive* progression goal
 * (`users.progression.dailyStepGoal`, starts at 3000 and self-adjusts) which
 * lives in `smart-goals.service.ts`. Do NOT collapse the two — they serve
 * different purposes.
 */

/**
 * Default daily step goal shown across the app when a user has no
 * per-day `dailyActivity.stepsGoal` value yet. Matches the value written by
 * `createEmptyDailyActivity()`.
 */
export const DAILY_STEP_GOAL = 8_000;

/**
 * Canonical brand color for the *steps* metric (rings, bars, icons, calendar
 * dots). This is steps-specific — it is NOT the running or strength color and
 * must not be applied to those metrics.
 */
export const STEPS_COLOR = '#00C07A';
