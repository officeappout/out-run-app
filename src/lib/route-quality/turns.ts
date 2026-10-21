import type { LngLat } from './types';
import { angleBetween, headingRad, pathLengthM, pointSegDist, projectorFor, type XY } from './geo';

/**
 * Turns and zigzag — how "twisty" a route reads on the map and on foot.
 *
 * turnsPerKm: the path is Douglas–Peucker simplified at TURN_SIMPLIFY_M (drops
 * vertex noise; gentle road curves leave only small per-vertex angles), then every remaining vertex whose
 * direction changes by more than TURN_MIN_DEG counts as one turn. A clean
 * block loop has 4 corners; a staircase through side streets has one every
 * block, and hopping from one sidewalk to the other adds two more each time.
 *
 * zigzagIndex: path length / length of the same path simplified at
 * ZIGZAG_SIMPLIFY_M. Block-scale staircases (steps up to ~85 m) collapse to
 * their diagonal, so a pure staircase reads ≈ √2 ≈ 1.41 (coarser ~100 m steps
 * collapse partly, ≈ 1.2–1.3); a straight street or a rectangular loop reads
 * ≈ 1.0, a smooth 3 km circle ≈ 1.04.
 */
export const TURN_SIMPLIFY_M = 5;
export const TURN_MIN_DEG = 45;
export const ZIGZAG_SIMPLIFY_M = 60;
/** Simplified legs shorter than this are merged into the turn they belong to (a corner drawn as two vertices). */
const TURN_MERGE_M = 6;

/** Douglas–Peucker on projected points (iterative); returns kept indices in order. */
export function simplifyIndices(xy: XY[], tolM: number): number[] {
  const n = xy.length;
  if (n <= 2) return xy.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, worstD = tolM;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegDist(xy[i], xy[a], xy[b]).d;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

function simplifiedXY(path: LngLat[], tolM: number): XY[] {
  const proj = projectorFor(path);
  const xy = path.map(proj.toXY);
  return simplifyIndices(xy, tolM).map(i => xy[i]);
}

const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Direction changes > minDeg on the simplified line (loop closure at the start/end not counted). */
export function countTurns(path: LngLat[], opts: { simplifyM?: number; minDeg?: number } = {}): number {
  if (path.length < 3) return 0;
  const pts = simplifiedXY(path, opts.simplifyM ?? TURN_SIMPLIFY_M);
  // Merge vertices closer than TURN_MERGE_M (one corner drawn as two kinks).
  const v: XY[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (dist(v[v.length - 1], pts[i]) >= TURN_MERGE_M || i === pts.length - 1) v.push(pts[i]);
  const minRad = ((opts.minDeg ?? TURN_MIN_DEG) * Math.PI) / 180;
  let turns = 0;
  for (let i = 1; i < v.length - 1; i++) {
    if (angleBetween(headingRad(v[i - 1], v[i]), headingRad(v[i], v[i + 1])) > minRad) turns++;
  }
  return turns;
}

/** path length / simplified length (>= 1; 1 for a straight line or fewer than 3 points). */
export function zigzagIndex(path: LngLat[], simplifyM = ZIGZAG_SIMPLIFY_M): number {
  if (path.length < 3) return 1;
  const total = pathLengthM(path);
  const pts = simplifiedXY(path, simplifyM);
  let simple = 0;
  for (let i = 1; i < pts.length; i++) simple += dist(pts[i - 1], pts[i]);
  return simple > 0 ? Math.max(1, total / simple) : 1;
}

export interface TurnMetrics {
  turns: number;
  turnsPerKm: number;
  zigzagIndex: number;
}

export function turnMetrics(path: LngLat[]): TurnMetrics {
  const km = pathLengthM(path) / 1000;
  const turns = countTurns(path);
  return { turns, turnsPerKm: km > 0 ? turns / km : 0, zigzagIndex: zigzagIndex(path) };
}
