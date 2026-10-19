/**
 * Cached OSM road layer per area — memory + IndexedDB (7 days), one shared
 * in-flight request per area. The area key snaps the centre to a 0.01° grid
 * and the radius up to a whole km, and the fetched bbox is padded by the
 * snapping error, so any point inside the cell is fully covered.
 *
 * In the browser/app the layer comes from our own GET /api/route-quality/
 * osm-layer?key=… (CDN-cached for a week per area key; the public Overpass
 * mirrors refuse browser User-Agents or are often at capacity). Elsewhere
 * (server, scripts) it goes to Overpass directly.
 */
import { createPersistentTtlCache, type PersistentTtlCache } from '@/lib/persistentTtlCache';
import { createIdbRecordStore } from '@/lib/idbRecordStore';
import type { OsmRoadLayer } from './types';
import { bboxAround, fetchOsmRoadLayer, OVERPASS_USER_AGENT } from './osm-layer';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SNAP_DEG = 0.01;
const SNAP_PAD_KM = 0.8; // half a 0.01° cell diagonal (~0.75 km) + margin

const caches = new Map<string, PersistentTtlCache<OsmRoadLayer>>();

export interface OsmArea { key: string; lat: number; lng: number; radiusKm: number }

/** Parse "lat:lng:r" back into an area (null when malformed / not snapped). */
export function parseOsmAreaKey(key: string): OsmArea | null {
  const m = /^(-?\d{1,2}\.\d{2}):(-?\d{1,3}\.\d{2}):(\d{1,2})$/.exec(key);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]), radiusKm = Number(m[3]);
  if (radiusKm < 1 || radiusKm > 10) return null;
  return { key, lat, lng, radiusKm };
}

/** The bbox actually fetched for an area (centre ± radius + snapping pad). */
export function osmAreaBbox(a: OsmArea) {
  return bboxAround(a.lat, a.lng, a.radiusKm + SNAP_PAD_KM);
}

function fetchArea(a: OsmArea): Promise<OsmRoadLayer> {
  if (typeof window !== 'undefined') {
    return fetch(`/api/route-quality/osm-layer?key=${encodeURIComponent(a.key)}`).then(r => {
      if (!r.ok) throw new Error(`osm-layer ${r.status}`);
      return r.json() as Promise<OsmRoadLayer>;
    });
  }
  const withUA: typeof fetch = (url, init) =>
    fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': OVERPASS_USER_AGENT } });
  return fetchOsmRoadLayer(osmAreaBbox(a), { fetchImpl: withUA });
}

export function osmAreaKey(lat: number, lng: number, radiusKm: number): OsmArea {
  const sLat = Math.round(lat / SNAP_DEG) * SNAP_DEG;
  const sLng = Math.round(lng / SNAP_DEG) * SNAP_DEG;
  const r = Math.max(1, Math.ceil(radiusKm));
  return { key: `${sLat.toFixed(2)}:${sLng.toFixed(2)}:${r}`, lat: sLat, lng: sLng, radiusKm: r };
}

/** The OSM road layer covering radiusKm around a point (cached). Rejects when Overpass is unreachable. */
export function getOsmRoadLayer(lat: number, lng: number, radiusKm: number): Promise<OsmRoadLayer> {
  const a = osmAreaKey(lat, lng, radiusKm);
  let c = caches.get(a.key);
  if (!c) {
    c = createPersistentTtlCache<OsmRoadLayer>({
      fetcher: () => fetchArea(a),
      ttlMs: TTL_MS,
      store: createIdbRecordStore<OsmRoadLayer>(`route-quality-osm:v1:${a.key}`),
      clone: (v) => v, // read-only consumers; skip deep copies of a large layer
    });
    caches.set(a.key, c);
  }
  return c.get();
}

/** Resolve within ms or give null (the fetch keeps running and fills the cache for next time). */
export function getOsmRoadLayerWithin(lat: number, lng: number, radiusKm: number, ms: number): Promise<OsmRoadLayer | null> {
  return Promise.race([
    getOsmRoadLayer(lat, lng, radiusKm).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

/**
 * Put an already-fetched layer in the in-memory cache for the area key of
 * (lat, lng, radiusKm) — for the measurement script / admin page, which
 * fetch a bigger layer once and want the generator to reuse it.
 */
export function seedOsmRoadLayer(lat: number, lng: number, radiusKm: number, layer: OsmRoadLayer): void {
  const a = osmAreaKey(lat, lng, radiusKm);
  caches.set(a.key, createPersistentTtlCache<OsmRoadLayer>({ fetcher: async () => layer, ttlMs: TTL_MS, clone: (v) => v }));
}
