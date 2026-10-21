/**
 * Health Goals — step/floor display constants.
 *
 * The user's daily step goal itself is resolved by ONE resolver,
 * `src/features/activity/lib/step-goal.ts` (adaptive by default, user can
 * override; stored on `users/{uid}.progression.dailyStepGoal`), shared with
 * the Cloud Functions. DAILY_STEP_GOAL below is its base (= BASE_STEP_GOAL)
 * and the fallback before a user's goal has been resolved.
 */

/**
 * Base daily step goal — the adaptive goal's starting point and the fallback
 * shown before the user's goal is resolved (and for a past day whose
 * `dailyActivity.stepsGoal` snapshot is missing). Matches the value written
 * by `createEmptyDailyActivity()`. Must equal BASE_STEP_GOAL in
 * features/activity/lib/step-goal.ts (asserted in its tests).
 */
export const DAILY_STEP_GOAL = 8_000;

/**
 * Canonical brand color for the *steps* metric (rings, bars, icons, calendar
 * dots). This is steps-specific — it is NOT the running or strength color and
 * must not be applied to those metrics.
 */
export const STEPS_COLOR = '#00C07A';
