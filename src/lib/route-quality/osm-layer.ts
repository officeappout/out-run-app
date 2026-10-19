import type { CrossingControl, CrossingNode, MajorRoad, OsmRoadLayer } from './types';

/** Roads a runner must cross with care — tertiary and bigger (links included). */
export const MAJOR_HIGHWAYS = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
] as const;
const MAJOR_SET = new Set<string>(MAJOR_HIGHWAYS);

export function isMajorHighway(highway: string | null | undefined): boolean {
  return !!highway && MAJOR_SET.has(highway);
}

export type Bbox = OsmRoadLayer['bbox'];

/** Overpass QL for tertiary+ ways (with geometry) and every crossing / signal node in a bbox. */
export function buildOverpassQuery(b: Bbox, timeoutSec = 25): string {
  const bb = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:${timeoutSec}];
(
  way["highway"~"^(${MAJOR_HIGHWAYS.join('|')})$"](${bb});
  node["highway"~"^(crossing|traffic_signals)$"](${bb});
  node["crossing"](${bb});
);
out tags geom;`;
}

type Tags = Record<string, string | undefined>;

/** OSM crossing tags → how well a pedestrian is protected. A bare highway=crossing is a designated (marked) crossing. */
export function crossingControlFromTags(t: Tags): CrossingControl {
  if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes') return 'signalled';
  if (t.crossing === 'unmarked' || t.crossing === 'no' || t['crossing:markings'] === 'no') return 'unmarked';
  return 'marked';
}

interface OverpassElement {
  type: 'way' | 'node' | string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Tags;
  geometry?: Array<{ lat: number; lon: number }>;
}

export function parseOverpassLayer(json: { elements?: OverpassElement[] }, bbox: Bbox): OsmRoadLayer {
  const roads: MajorRoad[] = [];
  const crossings: CrossingNode[] = [];
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    if (el.type === 'way' && isMajorHighway(tags.highway) && el.geometry && el.geometry.length >= 2) {
      roads.push({ id: el.id, highway: tags.highway!, name: tags.name, coords: el.geometry.map(g => [g.lon, g.lat]) });
    } else if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      crossings.push({ id: el.id, coord: [el.lon, el.lat], control: crossingControlFromTags(tags) });
    }
  }
  return { bbox, roads, crossings };
}

/** Overpass mirrors refuse Node's default User-Agent; server-side calls identify themselves. */
export const OVERPASS_USER_AGENT = 'OUT-route-quality/1.0 (office@appout.co.il)';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** One Overpass round trip (tries the mirror on failure). Throws when every endpoint fails. */
export async function fetchOsmRoadLayer(bbox: Bbox, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; endpoints?: string[] } = {}): Promise<OsmRoadLayer> {
  const f = opts.fetchImpl ?? fetch;
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(bbox));
  let lastErr: unknown = null;
  for (const url of opts.endpoints ?? OVERPASS_ENDPOINTS) {
    try {
      const res = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: opts.signal,
      });
      if (!res.ok) { lastErr = new Error(`overpass ${res.status}`); continue; }
      return parseOverpassLayer(await res.json(), bbox);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('overpass: no endpoint');
}

/** Bbox of radiusKm around a point. */
export function bboxAround(lat: number, lng: number, radiusKm: number): Bbox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, west: lng - dLng, north: lat + dLat, east: lng + dLng };
}

/**
 * Keep only crossing nodes that can matter: within 30 m of a major road
 * (a crossing on a residential street never classifies a tertiary+ crossing).
 * Shrinks the payload the app downloads several-fold.
 */
export function pruneLayer(layer: OsmRoadLayer, keepWithinM = 30): OsmRoadLayer {
  const lat0 = (layer.bbox.south + layer.bbox.north) / 2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  const cell = 60;
  const grid = new Map<string, Array<[number, number, number, number]>>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  for (const r of layer.roads) {
    for (let i = 1; i < r.coords.length; i++) {
      const a: [number, number] = [r.coords[i - 1][0] * kx, r.coords[i - 1][1] * ky];
      const b: [number, number] = [r.coords[i][0] * kx, r.coords[i][1] * ky];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cell));
      const seen = new Set<string>();
      for (let k = 0; k <= steps; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / steps, y = a[1] + ((b[1] - a[1]) * k) / steps;
        const kk = key(x, y);
        if (seen.has(kk)) continue;
        seen.add(kk);
        const arr = grid.get(kk) ?? [];
        arr.push([a[0], a[1], b[0], b[1]]);
        grid.set(kk, arr);
      }
    }
  }
  const near = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get(`${Math.floor(x / cell) + dx}:${Math.floor(y / cell) + dy}`);
      if (!arr) continue;
      for (const [ax, ay, bx, by] of arr) {
        const ddx = bx - ax, ddy = by - ay, l2 = ddx * ddx + ddy * ddy;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * ddx + (y - ay) * ddy) / l2));
        if (Math.hypot(x - (ax + t * ddx), y - (ay + t * ddy)) <= keepWithinM) return true;
      }
    }
    return false;
  };
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    bbox: layer.bbox,
    roads: layer.roads.map(r => ({ ...r, coords: r.coords.map(([x, y]) => [r6(x), r6(y)] as [number, number]) })),
    crossings: layer.crossings.filter(c => near(c.coord[0] * kx, c.coord[1] * ky)),
  };
}
