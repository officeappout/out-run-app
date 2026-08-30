/**
 * scripts/lib/route-composition-classify.ts — pure, I/O-free surface-composition
 * classifier for the quality-certificate v1 (%sidewalk / %dedicated / %ordinary
 * per route). This is a DIRECT PORT of the sidewalk-gate classifier already
 * live in scripts/geo-discovery-routes.ts (isSidewalkLikeWay /
 * isGenuineRecreationalWay, lines ~540-600 + the RECREATIONAL_* highway sets,
 * lines 298-299/327-331) — constants and thresholds below are byte-identical
 * to that file, confirmed by direct comparison. Do NOT let this drift from
 * geo-discovery-routes.ts; if that file's thresholds change, update here too.
 *
 * Deliberately mirrors the caller-does-I/O pattern already established by
 * route-comfort-tags.service.ts / route-adjacency.service.ts: this module
 * takes already-fetched OSM ways + an already-built spatial grid and does
 * pure geometry/classification only — no Firestore, no Overpass fetch, no
 * Node-only APIs. Browser-safe, and the intended reuse target for the
 * deferred route_decisions learning log (see route-editor-scoping-spec.md §5).
 *
 * Geometry primitives (haversine, bearing) are reused from geoUtils.ts
 * rather than reimplemented. The grid-indexed nearest-segment-with-bearing
 * search has no equivalent there (crossTrackDistanceMeters is unindexed
 * nearest-point-on-path only, no bearing, O(n) per query) so it's kept
 * bespoke here, mirroring geo-discovery-routes.ts's own grid.
 */
import { haversineMeters, bearingBetween } from '../../src/features/parks/core/services/geoUtils';

// ── Exact port of geo-discovery-routes.ts constants (lines 298-299, 327-331) ──
export const RECREATIONAL_DEDICATED_HIGHWAY = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);
export const RECREATIONAL_ORDINARY_HIGHWAY = new Set(['residential', 'tertiary', 'service', 'living_street', 'unclassified']);
export const SIDEWALK_PROXIMITY_M = 15;
export const SIDEWALK_ANGLE_DEG = 30;
export const SIDEWALK_FRACTION_THRESHOLD = 0.6;

const GRID_DEG = 0.0006;

export interface WayInfo {
  id: number;
  highway: string;
  footwayTag: string | null;
  isSidepath: boolean;
  pts: [number, number][]; // [lat, lng]
  lenM: number;
}
interface WaySeg { a: [number, number]; b: [number, number]; wayId: number }

export function pathLenM(pts: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversineMeters(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return s;
}

function pointToSegDistAndBearing(p: [number, number], a: [number, number], b: [number, number]): { distM: number; bearingDeg: number } {
  const refLat = a[0];
  const mLat = 111320, mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = (q: [number, number]): [number, number] => [q[1] * mLon, q[0] * mLat];
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const distM = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  return { distM, bearingDeg: bearingBetween(a[0], a[1], b[0], b[1]) };
}
function angleDiffMod180(a: number, b: number): number { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; }

export function buildWayGrid(segs: WaySeg[]): Map<string, WaySeg[]> {
  const grid = new Map<string, WaySeg[]>();
  for (const seg of segs) {
    const lat0 = Math.min(seg.a[0], seg.b[0]), lat1 = Math.max(seg.a[0], seg.b[0]);
    const lon0 = Math.min(seg.a[1], seg.b[1]), lon1 = Math.max(seg.a[1], seg.b[1]);
    for (let la = Math.floor(lat0 / GRID_DEG); la <= Math.floor(lat1 / GRID_DEG); la++) {
      for (let lo = Math.floor(lon0 / GRID_DEG); lo <= Math.floor(lon1 / GRID_DEG); lo++) {
        const key = `${la}:${lo}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(seg);
      }
    }
  }
  return grid;
}
export function nearbyWaySegs(p: [number, number], grid: Map<string, WaySeg[]>, radiusCells = 1): WaySeg[] {
  const la = Math.floor(p[0] / GRID_DEG), lo = Math.floor(p[1] / GRID_DEG);
  const out: WaySeg[] = []; const seen = new Set<WaySeg>();
  for (let da = -radiusCells; da <= radiusCells; da++) for (let dob = -radiusCells; dob <= radiusCells; dob++) {
    const bucket = grid.get(`${la + da}:${lo + dob}`); if (!bucket) continue;
    for (const s of bucket) if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
export function segsFromWays(ways: WayInfo[]): WaySeg[] {
  const segs: WaySeg[] = [];
  for (const w of ways) for (let i = 1; i < w.pts.length; i++) segs.push({ a: w.pts[i - 1], b: w.pts[i], wayId: w.id });
  return segs;
}

/** Exact port of isSidewalkLikeWay / detectSidewalk (tag OR geometric parallel-to-road). */
export function detectSidewalk(way: WayInfo, roadGrid: Map<string, WaySeg[]>): boolean {
  if (way.footwayTag === 'sidewalk' || way.isSidepath) return true;
  const SAMPLE_SPACING_M = 10;
  let parallelLen = 0;
  for (let i = 1; i < way.pts.length; i++) {
    const a = way.pts[i - 1], b = way.pts[i];
    const segLen = haversineMeters(a[0], a[1], b[0], b[1]); if (segLen === 0) continue;
    const wayBearing = bearingBetween(a[0], a[1], b[0], b[1]);
    const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_M));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const p: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      let best = Infinity, bestBearing = 0;
      for (const rs of nearbyWaySegs(p, roadGrid)) {
        const { distM, bearingDeg } = pointToSegDistAndBearing(p, rs.a, rs.b);
        if (distM < best) { best = distM; bestBearing = bearingDeg; }
      }
      const sampleLen = segLen / steps;
      if (best <= SIDEWALK_PROXIMITY_M && angleDiffMod180(wayBearing, bestBearing) <= SIDEWALK_ANGLE_DEG) parallelLen += sampleLen;
    }
  }
  return way.lenM > 0 ? (parallelLen / way.lenM) >= SIDEWALK_FRACTION_THRESHOLD : false;
}

export type WayCategory = 'sidewalk' | 'dedicated' | 'ordinary' | 'other';
export function classifyWay(way: WayInfo, roadGrid: Map<string, WaySeg[]>, cache: Map<number, WayCategory>): WayCategory {
  if (cache.has(way.id)) return cache.get(way.id)!;
  let category: WayCategory;
  if (RECREATIONAL_DEDICATED_HIGHWAY.has(way.highway)) category = detectSidewalk(way, roadGrid) ? 'sidewalk' : 'dedicated';
  else if (RECREATIONAL_ORDINARY_HIGHWAY.has(way.highway)) category = 'ordinary';
  else category = 'other';
  cache.set(way.id, category);
  return category;
}

/** Snaps each route-path segment's midpoint to the nearest OSM way within 20m. */
export function assignPathToWays(path: [number, number][], allGrid: Map<string, WaySeg[]>): Array<{ wayId: number | null; segLenM: number }> {
  const out: Array<{ wayId: number | null; segLenM: number }> = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = haversineMeters(a[0], a[1], b[0], b[1]);
    if (segLen === 0) continue;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best = Infinity, bestWay: number | null = null;
    for (const s of nearbyWaySegs(mid, allGrid, 2)) {
      const { distM } = pointToSegDistAndBearing(mid, s.a, s.b);
      if (distM < best) { best = distM; bestWay = s.wayId; }
    }
    out.push({ wayId: best <= 20 ? bestWay : null, segLenM: segLen });
  }
  return out;
}

export interface RouteComposition {
  sidewalkPct: number;
  dedicatedPct: number;
  ordinaryPct: number;
  otherPct: number;    // matched to a way, but an unlisted highway tag (track/secondary/primary/etc.)
  unmatchedPct: number; // no OSM way found within the 20m snap threshold
  totalLenM: number;
}

/** Pure: composes a route's full sidewalk/dedicated/ordinary/other/unmatched breakdown. */
export function computeRouteComposition(
  path: [number, number][],
  waysById: Map<number, WayInfo>,
  allGrid: Map<string, WaySeg[]>,
  roadGrid: Map<string, WaySeg[]>,
  wayCategoryCache: Map<number, WayCategory>,
): RouteComposition {
  const assigns = assignPathToWays(path, allGrid);
  let sidewalkLen = 0, dedicatedLen = 0, ordinaryLen = 0, otherLen = 0, unmatchedLen = 0;
  for (const a of assigns) {
    if (a.wayId === null) { unmatchedLen += a.segLenM; continue; }
    const way = waysById.get(a.wayId);
    if (!way) { otherLen += a.segLenM; continue; }
    const cat = classifyWay(way, roadGrid, wayCategoryCache);
    if (cat === 'sidewalk') sidewalkLen += a.segLenM;
    else if (cat === 'dedicated') dedicatedLen += a.segLenM;
    else if (cat === 'ordinary') ordinaryLen += a.segLenM;
    else otherLen += a.segLenM;
  }
  const totalLenM = sidewalkLen + dedicatedLen + ordinaryLen + otherLen + unmatchedLen || 1;
  const pct = (n: number) => Math.round((n / totalLenM) * 1000) / 10;
  return {
    sidewalkPct: pct(sidewalkLen),
    dedicatedPct: pct(dedicatedLen),
    ordinaryPct: pct(ordinaryLen),
    otherPct: pct(otherLen),
    unmatchedPct: pct(unmatchedLen),
    totalLenM,
  };
}
