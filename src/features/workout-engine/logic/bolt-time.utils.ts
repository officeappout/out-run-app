/**
 * bolt-time.utils — pure per-bolt time-budget resolution
 * (extracted from home-workout.service for unit-testing; stability fix א׳).
 *
 * Rule: a MANUAL builder request is honoured below the bolt ceiling; the
 * home-dashboard trio (no manual intent) keeps the historical per-bolt
 * durations (30/45/60). The ceiling is never exceeded.
 */
export function resolveEffectiveBoltTime(
  requestedMin: number | undefined,
  isManualOverride: boolean | undefined,
  boltDurationCap: number,
): number {
  const requested =
    isManualOverride && requestedMin && requestedMin > 0 ? requestedMin : undefined;
  return Math.min(requested ?? boltDurationCap, boltDurationCap);
}
