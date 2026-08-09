/**
 * hybrid-aerobic.util — pure aerobic-target-distance derivation, shared by the hybrid compose
 * paths (composeHybridPlan + composeRouteStopsWorkout). Extracted so BOTH call sites use one
 * formula and it is unit-testable in isolation (no store/Firestore/Mapbox deps).
 */

/**
 * Step-gap calibration (09.08.2026): how much to boost the base target, by how much of the
 * daily step goal is still outstanding. Mirrors rank-suggestions.ts' stepDeficit factor exactly
 * (`Math.min(1, context.stepsRemaining / context.stepGoal)`) — the one existing "calibrate by
 * gap size" precedent in this codebase — rather than inventing a new ratio shape. No step data,
 * or the goal is already met (stepsRemaining <= 0) → 0 boost.
 */
const STEP_GAP_BOOST_MAX = 0.3; // full day's goal still outstanding → up to +30% target km

function stepGapBoost(stepsRemaining?: number, stepGoal?: number): number {
  if (stepGoal == null || stepGoal <= 0 || stepsRemaining == null) return 0;
  const deficitRatio = Math.min(1, Math.max(0, stepsRemaining / stepGoal));
  return STEP_GAP_BOOST_MAX * deficitRatio;
}

/**
 * PURE: target route length (km) for the aerobic portion of a hybrid session.
 * Mirrors the historical inline logic: aerobicMin = timeBudget × aerobicShare, over a speed of
 * 12 min/km (walking, fixed) or the runner's pace (running). `basePaceSecPerKm ≤ 0` (a profile
 * that never ran) falls back to 6.5 min/km so the result never goes Infinity. Clamped to [1, 20].
 *
 * `stepContext` (optional, 09.08.2026): when the caller has real stepsRemaining/stepGoal
 * numbers, boosts the base target proportionally to the outstanding gap (see stepGapBoost
 * above) — a bigger deficit nudges the route longer, within the SAME existing [1, 20] clamp.
 * Omitted (or no usable data) → 0 boost, byte-identical to the pre-calibration formula. Callers
 * resolve these as plain numbers themselves (buildStepContext / UserContext.stepsRemaining) —
 * this function stays pure, no store/hook read here.
 */
export function deriveAerobicTargetKm(
  intent: { timeBudgetMin: number; aerobicShare: number; aerobicKind: 'walking' | 'running' },
  basePaceSecPerKm: number,
  stepContext?: { stepsRemaining?: number; stepGoal?: number },
): number {
  const aerobicMin = intent.timeBudgetMin * intent.aerobicShare;
  const runPaceMinPerKm = basePaceSecPerKm > 0 ? basePaceSecPerKm / 60 : 6.5;
  const speedMinPerKm = intent.aerobicKind === 'walking' ? 12 : runPaceMinPerKm;
  let targetKm = aerobicMin / speedMinPerKm;
  if (!Number.isFinite(targetKm) || targetKm <= 0) targetKm = 2.5;
  targetKm *= 1 + stepGapBoost(stepContext?.stepsRemaining, stepContext?.stepGoal);
  return Math.max(1, Math.min(20, targetKm));
}
