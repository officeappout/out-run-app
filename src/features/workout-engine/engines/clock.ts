/**
 * clock — the one time source the engines accept (pure, injectable).
 *
 * The engines never read a clock themselves: every event carries `atMs`.
 * Callers (hooks) produce `atMs` with `createMonotonicNow()`, which wraps a
 * wall-clock source and never lets time run backwards (NTP / manual clock
 * changes). Wall time is the source on purpose: `performance.now()` can stop
 * while a phone sleeps, while `Date.now()` keeps counting, so a block that
 * was running while the app was in the background is simply recomputed from
 * its start timestamp on resume. Nothing is accumulated tick by tick.
 */

export type NowFn = () => number;

/** A `now()` that never decreases (clamps backward jumps of the source). */
export function createMonotonicNow(source: NowFn = Date.now): NowFn {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const t = source();
    if (Number.isFinite(t) && t > last) last = t;
    return Number.isFinite(last) ? last : 0;
  };
}
