/**
 * rank-suggestions.weights — manual weights for the §8.1 ranking factors. Doc §14 defers
 * calibration to real usage data: "לכייל משקלי הדירוג — להתחיל בערכים ידניים ולכוונן לפי נתונים
 * אמיתיים." These are the starting manual values, not tuned — expect to revisit once
 * scoreBreakdown telemetry exists (plan §11.5's "persist scoreBreakdown" step).
 */
export const RANK_WEIGHTS = {
  goalMatch: 30,
  gapFilling: 25,
  stepDeficit: 20,
  preferenceMatch: 15,
  recoveryMatch: 20,
  locationBonus: 10,
  timeOfDayMatch: 10,
} as const;
