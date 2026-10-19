/**
 * Small geometry helpers for generation review. Pure.
 */
import { geohashForLocation } from 'geofire-common';
import { haversineM, makeProjector } from '@/lib/route-quality/geo';
import type { LngLat } from '@/lib/route-quality/types';

/** Coarse area cell (~4.9 × 4.9 km). The ONLY form a user location is ever stored in. */
export function areaGeohash5(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return geohashForLocation([lat, lng], 5);
}

/** Shortest distance (m) from a point to a polyline; null for an empty line. */
export function distanceToPathM(point: LngLat, path: LngLat[]): number | null {
  if (path.length === 0) return null;
  if (path.length === 1) return haversineM(point, path[0]);
  const proj = makeProjector(point);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = proj.toXY(path[i - 1]);
    const [bx, by] = proj.toXY(path[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Cut `trimM` metres off both ends of a line (privacy: the start is often the user's home). */
export function trimPathEnds(path: LngLat[], trimM: number): LngLat[] {
  if (path.length < 2 || trimM <= 0) return path.slice();
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineM(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  if (total <= 2 * trimM) return [];
  const at = (d: number): LngLat => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1];
    const t = seg === 0 ? 0 : (d - cum[i - 1]) / seg;
    const [a, b] = [path[i - 1], path[i]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const out: LngLat[] = [at(trimM)];
  for (let i = 0; i < path.length; i++) if (cum[i] > trimM && cum[i] < total - trimM) out.push(path[i]);
  out.push(at(total - trimM));
  return out;
}

export function roundCoord(p: LngLat, decimals = 4): LngLat {
  const k = 10 ** decimals;
  return [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k];
}
