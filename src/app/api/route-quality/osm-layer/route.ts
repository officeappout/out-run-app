/**
 * GET /api/route-quality/osm-layer?key=<lat>:<lng>:<radiusKm>
 *
 * The OSM context route quality v1 judges loops against (tertiary+ roads +
 * crossing/signal nodes) for one snapped area (src/lib/route-quality/
 * osm-layer-cache.ts — 0.01° centre, whole-km radius, Israel only). Proxies
 * Overpass server-side because the public mirrors refuse browser
 * User-Agents or are at capacity, and lets the CDN cache each area for a
 * week, so Overpass sees about one request per area per week.
 *
 * Public, read-only, no Firestore access. Not flag-gated: only the v1
 * generator (flag on) and the admin A/B page call it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchOsmRoadLayer, OVERPASS_USER_AGENT, pruneLayer } from '@/lib/route-quality/osm-layer';
import { osmAreaBbox, parseOsmAreaKey } from '@/lib/route-quality/osm-layer-cache';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ISRAEL = { south: 29.3, north: 33.5, west: 34.0, east: 35.95 };

const withUA: typeof fetch = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': OVERPASS_USER_AGENT } });

export async function GET(request: NextRequest) {
  const area = parseOsmAreaKey(request.nextUrl.searchParams.get('key') ?? '');
  if (!area || area.lat < ISRAEL.south || area.lat > ISRAEL.north || area.lng < ISRAEL.west || area.lng > ISRAEL.east) {
    return NextResponse.json({ error: 'Invalid area' }, { status: 400 });
  }
  try {
    const layer = pruneLayer(await fetchOsmRoadLayer(osmAreaBbox(area), { fetchImpl: withUA, signal: AbortSignal.timeout(50_000) }));
    return NextResponse.json(layer, {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' },
    });
  } catch (e) {
    console.warn('[osm-layer] overpass unavailable:', (e as Error)?.message);
    return NextResponse.json({ error: 'OSM unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
