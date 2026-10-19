import type { LngLat } from './types';
import { cumulative, pathLengthM, pointAt, projectorFor, segIntersection, sideOf, type XY } from './geo';
import { SegmentGrid } from './grid';

/** How far before/after an intersection the two passes are probed to confirm a real crossing. */
const PROBE_M = 12;
/** Probe points must sit at least this far off the other pass's line. */
const SIDE_MIN_M = 1.5;
/** Intersections closer than this (along both passes) are the same crossing. */
const SAME_CROSSING_M = 5;

/**
 * Real self-crossings: the route passes through a spot it already passed,
 * from one side of the earlier pass to the other. Shared vertices count
 * (real junction geometry puts both passes on the same OSM node — the
 * strict-only test misses those); touching, overlapping/retracing and the
 * closing vertex do not.
 */
export function countSelfIntersections(path: LngLat[]): number {
  const n = path.length;
  if (n < 4) return 0;
  const proj = projectorFor(path);
  const xy: XY[] = path.map(proj.toXY);
  const cum = cumulative(xy);
  const total = cum[n - 1];
  const grid = new SegmentGrid<number>(50);
  for (let i = 0; i < n - 1; i++) grid.add(xy[i], xy[i + 1], i);
  const found: Array<{ sA: number; sB: number }> = [];
  for (let i = 0; i < n - 1; i++) {
    for (const s of grid.nearSegment(xy[i], xy[i + 1])) {
      const j = s.data;
      if (j <= i + 1) continue;
      const hit = segIntersection(xy[i], xy[i + 1], s.a, s.b);
      if (!hit) continue;
      const sA = cum[i] + hit.t * (cum[i + 1] - cum[i]);
      const sB = cum[j] + hit.u * (cum[j + 1] - cum[j]);
      if (sB - sA < 2 * PROBE_M) continue; // local wiggle, not a second pass
      if (sA < PROBE_M && total - sB < PROBE_M) continue; // the loop closing on its start
      if (found.some(f => Math.abs(f.sA - sA) < SAME_CROSSING_M && Math.abs(f.sB - sB) < SAME_CROSSING_M)) continue;
      const a1 = pointAt(xy, cum, sA - PROBE_M), a2 = pointAt(xy, cum, sA + PROBE_M);
      const b1 = sideOf(pointAt(xy, cum, sB - PROBE_M), a1, a2);
      const b2 = sideOf(pointAt(xy, cum, sB + PROBE_M), a1, a2);
      if (Math.abs(b1) < SIDE_MIN_M || Math.abs(b2) < SIDE_MIN_M || Math.sign(b1) === Math.sign(b2)) continue;
      found.push({ sA, sB });
    }
  }
  return found.length;
}

/** Isoperimetric quotient 4πA/P² of the path closed back to its first point (circle 1, square ≈ 0.785, out-and-back ≈ 0). */
export function compactness(path: LngLat[]): number {
  if (path.length < 3) return 0;
  const proj = projectorFor(path);
  const xy = path.map(proj.toXY);
  let a2 = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    a2 += x1 * y2 - x2 * y1;
  }
  const area = Math.abs(a2) / 2;
  const closed = pathLengthM([...path, path[0]]);
  return closed === 0 ? 0 : (4 * Math.PI * area) / (closed * closed);
}
