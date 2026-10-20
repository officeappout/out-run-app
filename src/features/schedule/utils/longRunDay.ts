/**
 * The user's long-run day (`profile.running.longRunDay`, enable_home_v2).
 * Tiny on purpose: the onboarding sync and the schedule builder's save import
 * it without pulling in the schedule engine.
 */

/** A stored long-run day (0 = Sunday … 6 = Saturday); anything else → null. */
export function normalizeLongRunDay(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6 ? v : null;
}
