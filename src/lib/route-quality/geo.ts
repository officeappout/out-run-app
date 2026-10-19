import type { LngLat } from './types';

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLengthM(path: LngLat[]): number {
  let t = 0;
  for (let i = 1; i < path.length; i++) t += haversineM(path[i - 1], path[i]);
  return t;
}

/** Local equirectangular projection (metres) around an origin — accurate to <0.1% over a few km. */
export interface Projector {
  toXY(p: LngLat): [number, number];
  toLngLat(xy: [number, number]): LngLat;
}

export function makeProjector(origin: LngLat): Projector {
  const kx = R * toRad(1) * Math.cos(toRad(origin[1]));
  const ky = R * toRad(1);
  return {
    toXY: (p) => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    toLngLat: ([x, y]) => [origin[0] + x / kx, origin[1] + y / ky],
  };
}

export function projectorFor(path: LngLat[]): Projector {
  if (path.length === 0) return makeProjector([0, 0]);
  let lng = 0, lat = 0;
  for (const p of path) { lng += p[0]; lat += p[1]; }
  return makeProjector([lng / path.length, lat / path.length]);
}

export type XY = [number, number];

/** Evenly spaced samples (every stepM, in projected metres) along a polyline, plus the cumulative distance of each. */
export function resampleXY(pts: XY[], stepM: number): { pts: XY[]; at: number[] } {
  const out: XY[] = [];
  const at: number[] = [];
  if (pts.length === 0) return { pts: out, at };
  out.push(pts[0]); at.push(0);
  let cum = 0;
  let next = stepM;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg === 0) continue;
    while (next <= cum + seg) {
      const t = (next - cum) / seg;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      at.push(next);
      next += stepM;
    }
    cum += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) { out.push(last); at.push(cum); }
  return { pts: out, at };
}

/** Heading of a→b in radians (math convention, x east / y north). */
export function headingRad(a: XY, b: XY): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/** Absolute angle between two headings, 0..π. */
export function angleBetween(h1: number, h2: number): number {
  let d = Math.abs(h1 - h2) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/** Distance from p to segment ab (projected metres) and the parameter t of the foot. */
export function pointSegDist(p: XY, a: XY, b: XY): { d: number; t: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

/** Intersection of segments p1p2 and q1q2 with its parameters (endpoints included; parallel/collinear → null). */
export function segIntersection(p1: XY, p2: XY, q1: XY, q2: XY): { p: XY; t: number; u: number } | null {
  const rX = p2[0] - p1[0], rY = p2[1] - p1[1];
  const sX = q2[0] - q1[0], sY = q2[1] - q1[1];
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const qpX = q1[0] - p1[0], qpY = q1[1] - p1[1];
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { p: [p1[0] + t * rX, p1[1] + t * rY], t, u };
}

/** Signed distance of p from the infinite line a→b (left positive). */
export function sideOf(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len;
}

/** Cumulative distances of a projected polyline's vertices. */
export function cumulative(pts: XY[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

/** Point at distance s along a projected polyline (clamped to its ends). */
export function pointAt(pts: XY[], cum: number[], s: number): XY {
  if (s <= 0) return pts[0];
  const total = cum[cum.length - 1];
  if (s >= total) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}
