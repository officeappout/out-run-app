/**
 * bolt-time.utils — pure per-bolt time-budget resolution.
 *
 * CONTRACT, updated 06.09.2026 (docs/workout-engine/03-CHANGES.md Addendum
 * 15/19, F4; 00-PLAN.md §16 — explicit choice beats engine heuristics):
 *
 *   - AUTOMATIC suggestions (the home carousel's 3-option trio, no explicit
 *     per-bolt request) — BOLT_DURATION_CAPS {30/45/60} apply as a CEILING,
 *     same as before. `availableTime` is honoured (±3 min) below the cap,
 *     silently shortened above it — this is fine here, since the user never
 *     asked for one specific bolt at one specific length.
 *   - EXPLICIT single-bolt requests (`isExplicitChoice=true` — the slider
 *     and Custom Builder, both of which set `targetDifficulty`) — the cap
 *     does NOT apply at all. The requested duration is delivered in full,
 *     at every difficulty. A user asking for "45 min, easy" must get ~45
 *     min, not the D1 ceiling of 30 — "קל" means fewer/easier sets, not a
 *     shorter session.
 *
 * (Prior contract, approved 10.07.2026, superseded the older
 * `isManualOverride` gate with a universal ceiling for all paths — this
 * update reinstates the explicit/automatic distinction under the new
 * meta-rule, using `targetDifficulty != null` as the signal instead of
 * `isManualOverride`, since that flag also affects unrelated behavior
 * (weekly-budget deficit clamping) that this fix does not intend to touch.)
 */
export function resolveEffectiveBoltTime(
  requestedMin: number | undefined,
  boltDurationCap: number,
  isExplicitChoice: boolean = false,
): number {
  const requested = requestedMin && requestedMin > 0 ? requestedMin : undefined;
  if (isExplicitChoice && requested != null) return requested;
  return Math.min(requested ?? boltDurationCap, boltDurationCap);
}
