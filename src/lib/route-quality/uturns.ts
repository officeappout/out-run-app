import type { LngLat, UTurnMark } from './types';
import { angleBetween, headingRad, projectorFor, resampleXY, type XY } from './geo';

/** Resample step (m). */
const STEP_M = 5;
/** Heading is measured over this much path on each side of a candidate tip. */
const WINDOW_M = 15;
/** A direction change at least this large is a reversal candidate. */
const REVERSAL_RAD = (150 * Math.PI) / 180;
/** Points on the two sides of the tip closer than this are "the same street". */
const MIRROR_TOL_M = 10;
/** A reversal must mirror for at least this long to count (filters hairpins between different streets). */
const MIN_DEPTH_M = 8;
/** Mirror depth at/above which the reversal is a dead-end spur rather than a short U-turn. */
export const SPUR_MIN_M = 40;
/** Reversals this close to the start/end are the loop's own start, not a U-turn. */
const END_GUARD_M = 30;

export interface ReversalTip { index: number; depthSteps: number }

/** Reversal tips on an already-resampled XY polyline (exported for trim-spurs). */
export function findReversalTips(pts: XY[], at: number[], stepM = STEP_M): ReversalTip[] {
  const n = pts.length;
  const w = Math.max(1, Math.round(WINDOW_M / stepM));
  const total = at[n - 1] ?? 0;
  const tips: ReversalTip[] = [];
  let i = w;
  while (i < n - w) {
    const turn = angleBetween(headingRad(pts[i - w], pts[i]), headingRad(pts[i], pts[i + w]));
    if (turn < REVERSAL_RAD || at[i] < END_GUARD_M || at[i] > total - END_GUARD_M) { i++; continue; }
    // Walk the run of reversal candidates, keep the most mirrored one as the tip.
    let best = i, bestGap = Infinity;
    let j = i;
    while (j < n - w && angleBetween(headingRad(pts[j - w], pts[j]), headingRad(pts[j], pts[j + w])) >= REVERSAL_RAD) {
      const gap = Math.hypot(pts[j - w][0] - pts[j + w][0], pts[j - w][1] - pts[j + w][1]);
      if (gap < bestGap) { bestGap = gap; best = j; }
      j++;
    }
    let k = 1;
    while (best - k >= 0 && best + k < n &&
      Math.hypot(pts[best - k][0] - pts[best + k][0], pts[best - k][1] - pts[best + k][1]) <= MIRROR_TOL_M) k++;
    const depthSteps = k - 1;
    if (depthSteps * stepM >= MIN_DEPTH_M) tips.push({ index: best, depthSteps });
    i = Math.max(j, best + k);
  }
  return tips;
}

/** U-turns and dead-end spurs along a route. */
export function detectUTurns(path: LngLat[]): UTurnMark[] {
  if (path.length < 3) return [];
  const proj = projectorFor(path);
  const { pts, at } = resampleXY(path.map(proj.toXY), STEP_M);
  return findReversalTips(pts, at).map(({ index, depthSteps }) => {
    const depthM = depthSteps * STEP_M;
    return { coord: proj.toLngLat(pts[index]), atM: at[index], kind: depthM >= SPUR_MIN_M ? 'spur' : 'uturn', depthM };
  });
}
