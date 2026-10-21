/** Small planar helpers (local equirectangular projection — fine at park scale). */
import { haversineM, makeProjector, pathLengthM, pointSegDist, type XY } from '../route-quality/geo';
import type { LngLat } from './types';

export { haversineM, pathLengthM };

/** Area (m²) of a closed ring, shoelace in a local projection. */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 4) return 0;
  const proj = makeProjector(ring[0]);
  const xy = ring.map((p) => proj.toXY(p));
  let s = 0;
  for (let i = 1; i < xy.length; i++) s += xy[i - 1][0] * xy[i][1] - xy[i][0] * xy[i - 1][1];
  return Math.abs(s) / 2;
}

export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (m) from a point to a polyline. */
export function distToLineM(p: LngLat, line: LngLat[]): { d: number; at: LngLat } {
  const proj = makeProjector(p);
  const q: XY = [0, 0];
  let best = Infinity, at: LngLat = line[0];
  for (let i = 1; i < line.length; i++) {
    const a = proj.toXY(line[i - 1]), b = proj.toXY(line[i]);
    const r = pointSegDist(q, a, b);
    if (r.d < best) {
      best = r.d;
      at = proj.toLngLat([a[0] + (b[0] - a[0]) * r.t, a[1] + (b[1] - a[1]) * r.t]);
    }
  }
  return { d: best, at };
}

/** Points every stepM along a line (closed rings include the start once). */
export function resample(line: LngLat[], stepM: number): LngLat[] {
  const out: LngLat[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = haversineM(a, b);
    let pos = stepM - carry;
    while (pos <= len) {
      const t = pos / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pos += stepM;
    }
    carry = len - (pos - stepM);
  }
  return out;
}

export function bboxOf(lines: LngLat[][]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const l of lines) for (const [x, y] of l) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}
