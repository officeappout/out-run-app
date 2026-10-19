import type { LngLat } from './types';
import { angleBetween, headingRad, pointSegDist, projectorFor, resampleXY } from './geo';
import { SegmentGrid } from './grid';

const STEP_M = 5;
/** Two passes closer than this are on the same stretch (Mapbox returns the same centerline both ways). */
const TOL_M = 6;
/** Directions within this angle (either way) count as the same stretch. */
const PARALLEL_RAD = (30 * Math.PI) / 180;
/** Only stretches at least this far back along the route count — the local neighbourhood is not a retrace. */
const MIN_GAP_M = 40;

/**
 * Share (0..1) of the route length that re-walks a stretch the route already
 * walked earlier. Only the SECOND pass is counted, so a pure out-and-back is
 * 0.5 and the shared start/finish "stick" of a lollipop counts once.
 */
export function retracedFraction(path: LngLat[]): number {
  if (path.length < 2) return 0;
  const proj = projectorFor(path);
  const { pts, at } = resampleXY(path.map(proj.toXY), STEP_M);
  const n = pts.length;
  if (n < 3) return 0;
  const grid = new SegmentGrid<number>(25);
  for (let i = 0; i < n - 1; i++) grid.add(pts[i], pts[i + 1], i);
  let retraced = 0;
  for (let i = 1; i < n; i++) {
    const h = headingRad(pts[i - 1], pts[i]);
    for (const s of grid.near(pts[i], TOL_M)) {
      const j = s.data;
      if (at[j + 1] > at[i] - MIN_GAP_M) continue;
      if (pointSegDist(pts[i], s.a, s.b).d > TOL_M) continue;
      const a = angleBetween(h, headingRad(s.a, s.b));
      if (a <= PARALLEL_RAD || a >= Math.PI - PARALLEL_RAD) { retraced++; break; }
    }
  }
  return retraced / (n - 1);
}
