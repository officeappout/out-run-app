/**
 * hybrid-aerobic.util — pure aerobic-target-distance derivation, shared by the hybrid compose
 * paths (composeHybridPlan + composeRouteStopsWorkout). Extracted so BOTH call sites use one
 * formula and it is unit-testable in isolation (no store/Firestore/Mapbox deps).
 */

/**
 * PURE: target route length (km) for the aerobic portion of a hybrid session.
 * Mirrors the historical inline logic: aerobicMin = timeBudget × aerobicShare, over a speed of
 * 12 min/km (walking, fixed) or the runner's pace (running). `basePaceSecPerKm ≤ 0` (a profile
 * that never ran) falls back to 6.5 min/km so the result never goes Infinity. Clamped to [1, 20].
 */
export function deriveAerobicTargetKm(
  intent: { timeBudgetMin: number; aerobicShare: number; aerobicKind: 'walking' | 'running' },
  basePaceSecPerKm: number,
): number {
  const aerobicMin = intent.timeBudgetMin * intent.aerobicShare;
  const runPaceMinPerKm = basePaceSecPerKm > 0 ? basePaceSecPerKm / 60 : 6.5;
  const speedMinPerKm = intent.aerobicKind === 'walking' ? 12 : runPaceMinPerKm;
  let targetKm = aerobicMin / speedMinPerKm;
  if (!Number.isFinite(targetKm) || targetKm <= 0) targetKm = 2.5;
  return Math.max(1, Math.min(20, targetKm));
}
