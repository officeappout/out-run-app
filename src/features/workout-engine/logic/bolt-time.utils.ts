/**
 * bolt-time.utils — pure per-bolt time-budget resolution.
 *
 * CONTRACT, updated 27.10.2026 (owner: drop the duration ceilings): a requested
 * duration is honoured in full at every difficulty and on every path (automatic
 * trio and explicit single-bolt requests alike) — "קל" means fewer/easier sets,
 * not a shorter session. `boltDurationCap` is now only the fallback when nothing
 * valid was requested. `isExplicitChoice` is kept so call sites stay unchanged.
 */
export function resolveEffectiveBoltTime(
  requestedMin: number | undefined,
  boltDurationCap: number,
  _isExplicitChoice: boolean = false,
): number {
  const requested = requestedMin && requestedMin > 0 ? requestedMin : undefined;
  return requested ?? boltDurationCap;
}
