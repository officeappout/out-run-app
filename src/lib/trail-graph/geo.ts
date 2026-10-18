/**
 * trail-graph/geo.ts — small planar-approximation geometry helpers + a
 * grid spatial index. Pure. All coordinates [lng, lat].
 *
 * Distances below ~10 km use a local equirectangular projection (error
 * < 0.1 % at Israel's latitudes) — plenty for "is this lamp within 30 m".
 */
import { haversineM } from '@/lib/dem-tile-cache/elevation-profile';
import type { LngLat } from './types';

export { haversineM };

const M_PER_DEG_LAT = 111_320;

export function distM(a: LngLat, b: LngLat): number {
  return haversineM(a[1], a[0], b[1], b[0]);
}

/** Distance (m) from point p to segment ab, local projection. */
export function pointSegmentDistM(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * M_PER_DEG_LAT;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

export function pointPolylineDistM(p: LngLat, line: LngLat[]): number {
  if (line.length === 1) return distM(p, line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointSegmentDistM(p, line[i - 1], line[i]));
  return best;
}

export function midpointAlong(line: LngLat[]): LngLat {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += distM(line[i - 1], line[i]);
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distM(line[i - 1], line[i]);
    if (acc + d >= total / 2 && d > 0) {
      const t = (total / 2 - acc) / d;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    acc += d;
  }
  return line[0];
}

/** Even-odd ring test (ring = closed or open [lng,lat] list). */
export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** GeoJSON Polygon/MultiPolygon coordinates → point-in test (holes respected). */
export function pointInPolygonCoords(p: LngLat, geom: { type: string; coordinates: unknown }): boolean {
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []) as LngLat[][][];
  for (const poly of polys) {
    if (!poly.length || !pointInRing(p, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(p, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

export interface BboxLL { minLng: number; minLat: number; maxLng: number; maxLat: number }

export function bboxOf(points: LngLat[]): BboxLL {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [x, y] of points) {
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Uniform grid index over items with a bbox. `query(p, radiusM)` returns
 * candidates whose bbox is within radius — callers do the exact test.
 */
export class GridIndex<T> {
  private cells = new Map<string, T[]>();
  constructor(private cellDeg = 0.005) {}
  private key(ix: number, iy: number) { return `${ix}:${iy}`; }
  insert(item: T, b: BboxLL): void {
    const x0 = Math.floor(b.minLng / this.cellDeg), x1 = Math.floor(b.maxLng / this.cellDeg);
    const y0 = Math.floor(b.minLat / this.cellDeg), y1 = Math.floor(b.maxLat / this.cellDeg);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = this.key(x, y);
      const arr = this.cells.get(k);
      if (arr) arr.push(item); else this.cells.set(k, [item]);
    }
  }
  query(p: LngLat, radiusM: number): T[] {
    const dLat = radiusM / M_PER_DEG_LAT;
    const dLng = radiusM / (M_PER_DEG_LAT * Math.cos((p[1] * Math.PI) / 180));
    const x0 = Math.floor((p[0] - dLng) / this.cellDeg), x1 = Math.floor((p[0] + dLng) / this.cellDeg);
    const y0 = Math.floor((p[1] - dLat) / this.cellDeg), y1 = Math.floor((p[1] + dLat) / this.cellDeg);
    const seen = new Set<T>();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const it of this.cells.get(this.key(x, y)) ?? []) seen.add(it);
    }
    return Array.from(seen);
  }
}
