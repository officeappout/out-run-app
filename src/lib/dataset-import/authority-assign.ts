/**
 * Which authority owns a corridor (axioms §23: no CREATE without a resolved
 * authority). Majority of sampled points inside the authority's boundary
 * polygon (authorities.boundaryGeoJSON). Below MIN_MAJORITY → unresolved,
 * and the corridor is skipped + reported, never guessed.
 */
import { haversineM } from '../route-quality/geo';
import type { LngLat } from './types';

export const MIN_MAJORITY = 0.5;

export interface AuthorityBoundary {
  id: string;
  name: string;
  /** Polygon or MultiPolygon coordinates (GeoJSON order, [lng,lat]). */
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
}

function inRing(p: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInBoundary(p: LngLat, g: AuthorityBoundary['geometry']): boolean {
  const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((poly) => Array.isArray(poly) && poly.length > 0 && inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole)));
}

/** Points every ~stepM along the line (always includes both ends). */
export function samplePoints(coords: LngLat[], stepM = 100): LngLat[] {
  const out: LngLat[] = [coords[0]];
  let acc = 0;
  for (let k = 1; k < coords.length; k++) {
    acc += haversineM(coords[k - 1], coords[k]);
    if (acc >= stepM) { out.push(coords[k]); acc = 0; }
  }
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

export interface Assignment { authorityId: string | null; name: string | null; share: number; shares: Record<string, number> }

export function assignAuthority(coords: LngLat[], boundaries: AuthorityBoundary[]): Assignment {
  if (coords.length < 2 || !boundaries.length) return { authorityId: null, name: null, share: 0, shares: {} };
  const pts = samplePoints(coords);
  const counts = new Map<string, number>();
  for (const p of pts) for (const b of boundaries) if (pointInBoundary(p, b.geometry)) counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
  const shares: Record<string, number> = {};
  let best: string | null = null, bestN = 0;
  for (const [id, n] of Array.from(counts.entries())) {
    shares[id] = Math.round((n / pts.length) * 1000) / 1000;
    if (n > bestN || (n === bestN && best !== null && id < best)) { best = id; bestN = n; }
  }
  const share = bestN / pts.length;
  if (!best || share < MIN_MAJORITY) return { authorityId: null, name: null, share, shares };
  return { authorityId: best, name: boundaries.find((b) => b.id === best)?.name ?? null, share, shares };
}

/**
 * authorities/{id}.boundaryGeoJSON is stored as a JSON STRING (Firestore
 * rejects nested arrays — scripts/backfill-authority-boundary.ts), older docs
 * may hold the object. Accepts a Feature or a bare geometry; null otherwise.
 */
export function boundaryFromStored(raw: unknown): AuthorityBoundary['geometry'] | null {
  let v: any = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  const g = v?.type === 'Feature' ? v.geometry : v;
  return g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates) ? g : null;
}
