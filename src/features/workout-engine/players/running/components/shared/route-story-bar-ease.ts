/**
 * route-story-bar-ease — pure fill-interpolation math for RouteStoryBar.tsx,
 * split into a plain .ts module so it can actually be unit-tested (vitest in
 * this repo cannot parse/import .tsx files at all — not a jsdom/render
 * limitation, a transform-pipeline one; see route-story-bar-ease.test.ts).
 */

/** Per-frame ease toward the real target (0-1, higher = snappier). Tuned so a
 *  typical 4-5m GPS-threshold step (a few % of most goal distances) glides
 *  into view over a few hundred ms at 60fps, rather than jumping instantly. */
const FILL_EASE_FACTOR = 0.15;
/** Snap-close threshold (percentage points) — below this, ease all the way to
 *  avoid an asymptotic approach that never quite reaches the real target. */
const FILL_SNAP_EPSILON = 0.05;

/** Ease `prev` toward `target`, snapping once close enough. Pure. */
export function easeFillTowards(prev: number, target: number): number {
  const diff = target - prev;
  if (Math.abs(diff) < FILL_SNAP_EPSILON) return target;
  return prev + diff * FILL_EASE_FACTOR;
}
