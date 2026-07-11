/**
 * bolt-time.utils — pure per-bolt time-budget resolution.
 *
 * CONTRACT (approved 10.07.2026, supersedes the isManualOverride gate):
 * `availableTime` is a HARD user constraint — whenever provided (>0) it is
 * honoured (±3 min via the engine's compression pass) on EVERY path, no
 * flags. BOLT_DURATION_CAPS {30/45/60} are a CEILING + the default when no
 * time was provided. Difficulty (bolt) shapes intensity/density, never
 * duration. Dashboard parity holds because it passes 60 → min(60,cap) =
 * 30/45/60, bit-identical to the historical caps.
 */
export function resolveEffectiveBoltTime(
  requestedMin: number | undefined,
  boltDurationCap: number,
): number {
  const requested = requestedMin && requestedMin > 0 ? requestedMin : undefined;
  return Math.min(requested ?? boltDurationCap, boltDurationCap);
}
