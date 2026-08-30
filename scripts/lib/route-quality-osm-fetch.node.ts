/**
 * scripts/lib/route-quality-osm-fetch.node.ts — Node-only I/O layer shared by
 * scripts/audit-route-quality-signals.ts (Stage 1 report) and
 * scripts/backfill-route-quality-signals.ts (Stage 2 persistence). Extracted
 * so both scripts call the EXACT SAME per-city Overpass-fetch + grid-build +
 * composition-compute path — a structural guarantee the backfill reproduces
 * Stage 1's numbers, not a second hand-typed copy of the same algorithm that
 * could silently drift (same discipline as scripts/lib/distance-unit-
 * classify.ts, shared between the distance-unit audit and migration scripts).
 *
 * `.node.ts` because this does real I/O (https, per axioms §4's dynamic-
 * import-only convention doesn't apply to plain `https` — that's a Node
 * builtin, not googleapis/capacitor) — NOT browser-safe, unlike
 * route-composition-classify.ts which this wraps.
 */
import * as https from 'https';
import {
  WayInfo, WayCategory, buildWayGrid, segsFromWays, computeRouteComposition, pathLenM, RouteComposition,
} from './route-composition-classify';

const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];

export async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) quality-cert' } }, r => {
          const b: Buffer[] = []; r.on('data', d => b.push(d));
          r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode)));
        });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 3000)); }
  }
  throw new Error('overpass failed (all mirrors, all retries)');
}

const HIGHWAY_VOCAB = ['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track', 'residential', 'tertiary', 'service', 'living_street', 'unclassified', 'secondary', 'primary', 'trunk', 'motorway'];
const ROAD_HIGHWAY = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service']);
export const BBOX_MARGIN_DEG = 0.005; // ~550m

/** Derives a city bbox from the union of that city's own route paths + margin — NOT geo-discovery-routes.ts's REGIONS table (only covers 3 of 5 cities that actually have routes). */
export function deriveCityBbox(paths: [number, number][][]): { latMin: number; lonMin: number; latMax: number; lonMax: number; bboxStr: string } {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const path of paths) for (const [lat, lng] of path) {
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    lonMin = Math.min(lonMin, lng); lonMax = Math.max(lonMax, lng);
  }
  latMin -= BBOX_MARGIN_DEG; latMax += BBOX_MARGIN_DEG; lonMin -= BBOX_MARGIN_DEG; lonMax += BBOX_MARGIN_DEG;
  return { latMin, lonMin, latMax, lonMax, bboxStr: `${latMin},${lonMin},${latMax},${lonMax}` };
}

export interface CityWayGrid {
  waysById: Map<number, WayInfo>;
  allGrid: Map<string, ReturnType<typeof buildWayGrid> extends Map<string, infer V> ? V : never>;
  roadGrid: ReturnType<typeof buildWayGrid>;
  wayCount: number;
  roadWayCount: number;
}

/** Fetches all highway ways in a bbox and builds the classifier's grids — one Overpass call per city, reused across every route in that city. */
export async function fetchCityWayGrid(bboxStr: string): Promise<CityWayGrid> {
  const wayData = await overpass(`[out:json][timeout:180];way["highway"~"^(${HIGHWAY_VOCAB.join('|')})$"](${bboxStr});out geom tags;`);
  const waysById = new Map<number, WayInfo>();
  const allWays: WayInfo[] = [];
  const roadWays: WayInfo[] = [];
  for (const e of wayData.elements || []) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const pts: [number, number][] = e.geometry.map((p: any) => [p.lat, p.lon]);
    const t = e.tags || {};
    const info: WayInfo = { id: e.id, highway: t.highway || '(none)', footwayTag: t.footway || null, isSidepath: t.is_sidepath === 'yes', pts, lenM: pathLenM(pts) };
    waysById.set(e.id, info);
    allWays.push(info);
    if (ROAD_HIGHWAY.has(info.highway)) roadWays.push(info);
  }
  const allGrid = buildWayGrid(segsFromWays(allWays));
  const roadGrid = buildWayGrid(segsFromWays(roadWays));
  return { waysById, allGrid, roadGrid, wayCount: allWays.length, roadWayCount: roadWays.length };
}

/** Composes every route in a city given its already-fetched way grid. Pure aggregation over computeRouteComposition — no I/O of its own. */
export function computeCityComposition(routePaths: Array<{ id: string; path: [number, number][] }>, grid: CityWayGrid): Map<string, RouteComposition> {
  const wayCategoryCache = new Map<number, WayCategory>();
  const out = new Map<string, RouteComposition>();
  for (const r of routePaths) {
    out.set(r.id, computeRouteComposition(r.path, grid.waysById, grid.allGrid, grid.roadGrid, wayCategoryCache));
  }
  return out;
}
