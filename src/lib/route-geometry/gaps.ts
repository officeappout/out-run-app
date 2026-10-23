/**
 * route-geometry/gaps.ts — straight-line "bridges" inside a route polyline.
 *
 * Why this exists (24.10.2026): the trails pipeline used to join the
 * disconnected pieces of an OSM route relation (pieces clipped away by the
 * council boundary, missing ways) with straight lines — a "route" that cut
 * across country in a straight chord. The pipeline now splits such a relation
 * into continuous chains (trail-graph/route-assembly.ts orderSegmentChains);
 * these helpers MEASURE the same defect on a stored polyline (guard + repair).
 *
 * A single long step between two consecutive vertices is legitimate only on a
 * straight desert track with few OSM nodes, which is why the thresholds are
 * generous: GEOMETRY_GAP_SUSPICIOUS_M is where a step stops being plausible.
 * Pure — no I/O. Points are [lng, lat].
 */
export type GapPoint = readonly [number, number];

/** A step this long between two consecutive vertices is flagged (guard / repair). */
export const GEOMETRY_GAP_SUSPICIOUS_M = 500;
/**
 * Selection sends a route with a step this long to MANUAL REVIEW instead of auto-selecting it.
 * Higher than the "suspicious" cut on purpose: the first regional run's real chains show ~2 % of
 * legitimate chains with a 500 m+ vertex step (a straight desert way mapped with two nodes) but
 * only 4 of 2,766 at 1 km+, whereas the pre-fix bridges were mostly several km.
 */
export const GEOMETRY_GAP_REVIEW_M = 1000;
/** Repair splits a stored path at every step longer than this. */
export const GEOMETRY_GAP_SPLIT_M = GEOMETRY_GAP_SUSPICIOUS_M;

const R_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineLngLatM(a: GapPoint, b: GapPoint): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

export interface GapReport {
  /** Longest single step between consecutive vertices (m); 0 for < 2 points. */
  maxGapM: number;
  /** Steps longer than `thresholdM`. */
  gapCount: number;
  /** Sum of those steps (m) — the "bridge" length. */
  bridgeM: number;
  /** Total polyline length (m). */
  lengthM: number;
}

export function measureGaps(path: readonly GapPoint[], thresholdM = GEOMETRY_GAP_SUSPICIOUS_M): GapReport {
  let maxGapM = 0, gapCount = 0, bridgeM = 0, lengthM = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineLngLatM(path[i - 1], path[i]);
    lengthM += d;
    if (d > maxGapM) maxGapM = d;
    if (d > thresholdM) { gapCount++; bridgeM += d; }
  }
  return { maxGapM, gapCount, bridgeM, lengthM };
}

/** Longest single step (m) — the number stored as `geometryGapM`. Rounded to whole metres. */
export function maxVertexGapM(path: readonly GapPoint[]): number {
  return Math.round(measureGaps(path).maxGapM);
}

export const isSuspiciousGap = (gapM: number | null | undefined): boolean =>
  typeof gapM === 'number' && Number.isFinite(gapM) && gapM >= GEOMETRY_GAP_SUSPICIOUS_M;

/** Cut a polyline at every step longer than `maxStepM`; the bridge itself is dropped. Pieces with < 2 points are discarded. */
export function splitPathAtGaps<P extends GapPoint>(path: readonly P[], maxStepM = GEOMETRY_GAP_SPLIT_M): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  for (let i = 0; i < path.length; i++) {
    if (i > 0 && haversineLngLatM(path[i - 1], path[i]) > maxStepM) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
    }
    cur.push(path[i]);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

export function polylineLengthM(path: readonly GapPoint[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += haversineLngLatM(path[i - 1], path[i]);
  return s;
}
