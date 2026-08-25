/**
 * rank-suggestions.weights — manual weights for the §8.1 ranking factors. Doc §14 defers
 * calibration to real usage data: "לכייל משקלי הדירוג — להתחיל בערכים ידניים ולכוונן לפי נתונים
 * אמיתיים." These are the starting manual values, not tuned — expect to revisit once
 * scoreBreakdown telemetry exists (plan §11.5's "persist scoreBreakdown" step).
 *
 * `alreadyTrained` (17.8 build-plan Section 1/Step 0, 25.08.2026) is not one of the doc's
 * original 8 §8.1 factors — same "starting manual value, not tuned" status as the rest. Applied
 * as a negative adjustment (downrank, never exclusion) — see rank-suggestions.ts's own
 * alreadyTrained() for the full reasoning.
 */
export const RANK_WEIGHTS = {
  goalMatch: 30,
  gapFilling: 25,
  stepDeficit: 20,
  preferenceMatch: 15,
  recoveryMatch: 20,
  locationBonus: 10,
  timeOfDayMatch: 10,
  alreadyTrained: 15,
} as const;
