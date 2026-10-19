/**
 * Our routes near a loop start → ONE GraphHopper custom-model area (a
 * MultiPolygon feature, id OUR_ROUTES_AREA_ID): every route stretch within the
 * loop radius is simplified and each simplified segment becomes a rectangle
 * of ±bufferM around it (extended by bufferM at both ends so joints overlap).
 * Rectangles are always valid convex polygons, which GraphHopper's area index
 * accepts without repair.
 *
 * Request-size budget: GraphHopper is called with the custom model in every
 * request (~100 KB practical limit incl. the rest of the body), so the area
 * is held under OUR_ROUTES_AREA_MAX_BYTES: the simplification tolerance is
 * raised step by step and, if that is still too big, the stretches farthest
 * from the start are dropped first.
 *
 * Phase 2 (documented, not built): an import-time encoded value
 * `out_official_route` (custom GraphHopper import tagging every edge that our
 * routes cover) replaces this per-request area — zero request size, exact
 * edge matching, and usable with CH. Needs our routes exported as a GeoJSON
 * the import reads, and a re-import whenever routes change.
 */
import { makeProjector } from '@/lib/route-quality/geo';
import type { LngLat, OurRouteLine } from '@/lib/route-quality';
import type { GeoJsonPolygonFeature } from '../graphhopper/types';
import { clipLineToRadius, round5, simplifyLineM } from './simplify';

export const OUR_ROUTES_AREA_ID = 'our_routes';
export const OUR_ROUTES_AREA_BUFFER_M = 15;
export const OUR_ROUTES_AREA_MAX_BYTES = 60_000;
const TOLERANCES_M = [3, 6, 12, 25, 50];

type Ring = LngLat[];

function rectangles(stretch: LngLat[], center: LngLat, bufferM: number): Ring[] {
  const pr = makeProjector(center);
  const out: Ring[] = [];
  for (let i = 1; i < stretch.length; i++) {
    const [x0, y0] = pr.toXY(stretch[i - 1]);
    const [x1, y1] = pr.toXY(stretch[i]);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.5) continue;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const nx = -uy * bufferM, ny = ux * bufferM;
    const ax = x0 - ux * bufferM, ay = y0 - uy * bufferM;
    const bx = x1 + ux * bufferM, by = y1 + uy * bufferM;
    const ring = ([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]] as Array<[number, number]>)
      .map(p => { const ll = pr.toLngLat(p); return [round5(ll[0]), round5(ll[1])] as LngLat; });
    ring.push(ring[0]);
    out.push(ring);
  }
  return out;
}

export interface OurRoutesAreaResult {
  feature: GeoJsonPolygonFeature;
  rectangles: number;
  toleranceM: number;
  bytes: number;
  stretchesUsed: number;
  stretchesDropped: number;
}

export function buildOurRoutesArea(
  lines: OurRouteLine[],
  start: { lat: number; lng: number },
  radiusKm: number,
  opts: { bufferM?: number; maxBytes?: number } = {},
): OurRoutesAreaResult | null {
  const bufferM = opts.bufferM ?? OUR_ROUTES_AREA_BUFFER_M;
  const maxBytes = opts.maxBytes ?? OUR_ROUTES_AREA_MAX_BYTES;
  const center: LngLat = [start.lng, start.lat];
  const pr = makeProjector(center);
  const stretches = lines.flatMap(l => clipLineToRadius(l.path, center, radiusKm * 1000));
  if (stretches.length === 0) return null;
  const nearestM = (s: LngLat[]) => Math.min(...s.map(p => { const [x, y] = pr.toXY(p); return Math.hypot(x, y); }));
  // Nearest stretches first, so dropping from the end drops the farthest.
  const ordered = stretches.map(s => ({ s, d: nearestM(s) })).sort((a, b) => a.d - b.d).map(x => x.s);

  const make = (ss: LngLat[][], tol: number) => {
    const polys = ss.flatMap(s => rectangles(simplifyLineM(s, tol), center, bufferM)).map(r => [r]);
    const feature: GeoJsonPolygonFeature = {
      type: 'Feature', id: OUR_ROUTES_AREA_ID, properties: {},
      geometry: { type: 'MultiPolygon', coordinates: polys },
    };
    return { feature, rectangles: polys.length, bytes: JSON.stringify(feature).length };
  };

  for (const tol of TOLERANCES_M) {
    const r = make(ordered, tol);
    if (r.rectangles === 0) return null;
    if (r.bytes <= maxBytes) return { ...r, toleranceM: tol, stretchesUsed: ordered.length, stretchesDropped: 0 };
  }
  const tol = TOLERANCES_M[TOLERANCES_M.length - 1];
  for (let n = ordered.length - 1; n >= 1; n--) {
    const r = make(ordered.slice(0, n), tol);
    if (r.rectangles > 0 && r.bytes <= maxBytes) return { ...r, toleranceM: tol, stretchesUsed: n, stretchesDropped: ordered.length - n };
  }
  return null;
}
