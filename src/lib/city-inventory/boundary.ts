/**
 * city-inventory/boundary.ts — fast point-in-authority-boundary for the I1
 * run (docs/routes/CITY-MAPPING-PLAN.md §4.1 step 1/3). Pure.
 *
 * A city run tests hundreds of thousands of points against a boundary with
 * thousands of vertices, so edges are bucketed into horizontal latitude
 * bands: a ray cast only walks the edges of the point's band. Same even-odd
 * rule (holes excluded) as `pointInBoundary` in dataset-import/authority-assign.
 */
import { ringAreaM2 } from '@/lib/park-loops/geometry';
import type { LngLat } from '@/lib/park-loops/types';

export type BoundaryGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

interface Edge { x1: number; y1: number; x2: number; y2: number }

export interface BoundaryIndex {
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  /** Outer rings minus holes, km². */
  areaKm2: number;
  contains(p: LngLat): boolean;
}

const BAND_COUNT = 512;

function polygonsOf(g: BoundaryGeometry): LngLat[][][] {
  const raw = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter(Array.isArray)
    .map((poly) => (poly as unknown[]).filter((r): r is LngLat[] => Array.isArray(r) && r.length >= 4));
}

/** `null` when the geometry has no usable ring (axioms §23: no boundary ⇒ stop, never guess). */
export function buildBoundaryIndex(g: BoundaryGeometry | null | undefined): BoundaryIndex | null {
  if (!g) return null;
  const polys = polygonsOf(g).filter((p) => p.length > 0);
  if (!polys.length) return null;
  const edges: Edge[] = [];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let areaM2 = 0;
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      areaM2 += (i === 0 ? 1 : -1) * ringAreaM2(ring);
      for (let k = 1; k < ring.length; k++) {
        const [x1, y1] = ring[k - 1];
        const [x2, y2] = ring[k];
        edges.push({ x1, y1, x2, y2 });
        minLng = Math.min(minLng, x1); maxLng = Math.max(maxLng, x1);
        minLat = Math.min(minLat, y1); maxLat = Math.max(maxLat, y1);
      }
    });
  }
  if (!edges.length || !Number.isFinite(minLat)) return null;
  const h = (maxLat - minLat) / BAND_COUNT || 1e-9;
  const bands: Edge[][] = Array.from({ length: BAND_COUNT }, () => []);
  const bandOf = (y: number) => Math.min(BAND_COUNT - 1, Math.max(0, Math.floor((y - minLat) / h)));
  for (const e of edges) {
    for (let b = bandOf(Math.min(e.y1, e.y2)); b <= bandOf(Math.max(e.y1, e.y2)); b++) bands[b].push(e);
  }
  return {
    bbox: { minLng, minLat, maxLng, maxLat },
    areaKm2: Math.round((Math.max(0, areaM2) / 1e6) * 100) / 100,
    contains([x, y]: LngLat): boolean {
      if (!(x >= minLng && x <= maxLng && y >= minLat && y <= maxLat)) return false;
      let inside = false;
      for (const e of bands[bandOf(y)]) {
        if ((e.y1 > y) !== (e.y2 > y) && x < ((e.x2 - e.x1) * (y - e.y1)) / (e.y2 - e.y1) + e.x1) inside = !inside;
      }
      return inside;
    },
  };
}

/** Simple vertex-mean centre of a ring (the "is this park in the city" test, as in park-loops). */
export function ringCentre(ring: LngLat[]): LngLat {
  const n = ring.length || 1;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}
