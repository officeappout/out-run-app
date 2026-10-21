/**
 * Buffer overlap between two lines (NATIONWIDE-PLAN.md §3.1 dedup rule for
 * geometry that did not come from the segment graph): the share of A's length
 * lying within `bufferM` of B. ≥ 0.7 at 15 m = duplicate → the earlier-stage
 * source wins.
 */
import { haversineM, makeProjector, pointSegDist, type XY } from '../route-quality/geo';
import type { LngLat } from './types';

export const DEDUP_BUFFER_M = 15;
export const DEDUP_MIN_SHARE = 0.7;

export function overlapShare(a: LngLat[], b: LngLat[], bufferM = DEDUP_BUFFER_M, stepM = 20): number {
  if (a.length < 2 || b.length < 2) return 0;
  const proj = makeProjector(a[0]);
  const bxy: XY[] = b.map((p) => proj.toXY(p));
  let inside = 0, total = 0;
  for (let k = 1; k < a.length; k++) {
    const len = haversineM(a[k - 1], a[k]);
    const n = Math.max(1, Math.round(len / stepM));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const p = proj.toXY([a[k - 1][0] + (a[k][0] - a[k - 1][0]) * t, a[k - 1][1] + (a[k][1] - a[k - 1][1]) * t]);
      let best = Infinity;
      for (let j = 1; j < bxy.length && best > bufferM; j++) best = Math.min(best, pointSegDist(p, bxy[j - 1], bxy[j]).d);
      total += len / n;
      if (best <= bufferM) inside += len / n;
    }
  }
  return total > 0 ? inside / total : 0;
}

export function isDuplicate(a: LngLat[], b: LngLat[]): boolean {
  return overlapShare(a, b) >= DEDUP_MIN_SHARE;
}
