/**
 * Metre-tolerance Douglas–Peucker for [lng, lat] lines (local projection), and
 * a clip that keeps only the stretches of a line near a centre. Pure.
 */
import { makeProjector, pointSegDist, type XY } from '@/lib/route-quality/geo';
import type { LngLat } from '@/lib/route-quality';

function dp(xy: XY[], tolM: number): number[] {
  const keep = new Uint8Array(xy.length);
  keep[0] = 1; keep[xy.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, xy.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const { d } = pointSegDist(xy[i], xy[a], xy[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > tolM) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out: number[] = [];
  keep.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

export function simplifyLineM(path: LngLat[], tolM: number): LngLat[] {
  if (path.length <= 2 || tolM <= 0) return path.slice();
  const pr = makeProjector(path[0]);
  return dp(path.map(p => pr.toXY(p)), tolM).map(i => path[i]);
}

/**
 * The stretches of `path` within `radiusM` of `center` (a vertex outside the
 * radius ends a stretch; the first vertex outside is kept so the stretch
 * reaches the radius). Stretches shorter than 2 points are dropped.
 */
export function clipLineToRadius(path: LngLat[], center: LngLat, radiusM: number): LngLat[][] {
  const pr = makeProjector(center);
  const inside = path.map(p => { const [x, y] = pr.toXY(p); return x * x + y * y <= radiusM * radiusM; });
  const out: LngLat[][] = [];
  let cur: LngLat[] = [];
  for (let i = 0; i < path.length; i++) {
    const near = inside[i] || (i > 0 && inside[i - 1]) || (i + 1 < path.length && inside[i + 1]);
    if (near) cur.push(path[i]);
    else { if (cur.length >= 2) out.push(cur); cur = []; }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

export const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
