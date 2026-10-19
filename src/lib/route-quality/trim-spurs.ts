import type { LngLat } from './types';
import { pathLengthM, projectorFor, resampleXY, type XY } from './geo';
import { findReversalTips } from './uturns';

const STEP_M = 4;
const MAX_PASSES = 8;

/** Drop near-collinear densification points (keeps real corners). */
function dropCollinear(pts: XY[], tolM: number): XY[] {
  if (pts.length < 3) return pts;
  const out: XY[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const base = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (cross / base > tolM) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Cuts dead-end out-and-back spurs (and short U-turns) out of a route: the
 * path is cut at the base of each reversal and re-joined there, so the route
 * no longer walks into a street just to turn around. The start/finish is
 * never touched (reversal detection ignores the first/last 30 m).
 */
export function trimSpurs(path: LngLat[]): { path: LngLat[]; trimmedM: number; spursTrimmed: number } {
  if (path.length < 4) return { path, trimmedM: 0, spursTrimmed: 0 };
  const proj = projectorFor(path);
  let { pts } = resampleXY(path.map(proj.toXY), STEP_M);
  let spursTrimmed = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { pts: rs, at } = resampleXY(pts, STEP_M);
    const tips = findReversalTips(rs, at, STEP_M);
    if (tips.length === 0) { pts = rs; break; }
    // Cut from the back so earlier indices stay valid.
    const cut = [...rs];
    for (const { index, depthSteps } of [...tips].sort((a, b) => b.index - a.index)) {
      const from = index - depthSteps, to = index + depthSteps;
      if (from <= 0 || to >= cut.length - 1) continue;
      cut.splice(from + 1, to - from - 1);
      spursTrimmed++;
    }
    pts = cut;
  }
  if (spursTrimmed === 0) return { path, trimmedM: 0, spursTrimmed: 0 };
  const out = dropCollinear(pts, 0.5).map(proj.toLngLat);
  out[0] = path[0];
  out[out.length - 1] = path[path.length - 1];
  return { path: out, trimmedM: Math.max(0, pathLengthM(path) - pathLengthM(out)), spursTrimmed };
}
