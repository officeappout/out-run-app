/**
 * The OSM road layer (tertiary+ roads + crossing nodes) for scoring loops on
 * the server, from our own CDN-cached GET /api/route-quality/osm-layer (one
 * Overpass hit per area per week). Bounded wait; null when cold or slow — the
 * loop is then scored without the crossing bars (major-road share comes from
 * GraphHopper's road_class details instead).
 */
import type { OsmRoadLayer } from '@/lib/route-quality';
import { osmAreaKey } from '@/lib/route-quality/osm-layer-cache';

const memo = new Map<string, { layer: OsmRoadLayer; at: number }>();
const MEMO_MS = 6 * 60 * 60 * 1000;
const MEMO_MAX = 64;

export async function fetchOsmLayerForLoop(
  origin: string,
  start: { lat: number; lng: number },
  targetKm: number,
  waitMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OsmRoadLayer | null> {
  // Same area key as the on-device generator (route-generator.service.ts).
  const area = osmAreaKey(start.lat, start.lng, Math.max(targetKm, 1.5) / 2 + 0.5);
  const hit = memo.get(area.key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.layer;
  try {
    const res = await fetchImpl(`${origin}/api/route-quality/osm-layer?key=${encodeURIComponent(area.key)}`, { signal: AbortSignal.timeout(waitMs) });
    if (!res.ok) return null;
    const layer = (await res.json()) as OsmRoadLayer;
    if (!Array.isArray(layer?.roads) || !Array.isArray(layer?.crossings)) return null;
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
    memo.set(area.key, { layer, at: Date.now() });
    return layer;
  } catch {
    return null;
  }
}
