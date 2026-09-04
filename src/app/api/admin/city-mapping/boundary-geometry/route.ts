import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import osmtogeojson from 'osmtogeojson';
import { requireSuperAdminApi } from '@/lib/api-auth';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/boundary-geometry — Phase 1 Stage C2 (Add
 * City), step 2. Given a relation id the operator picked from
 * resolve-boundary's candidate list, fetches its FULL geometry and returns
 * it as GeoJSON for the map-confirm step, plus an accurate bbox computed
 * from that real geometry (more accurate than a hand-estimated one — this
 * is the same "compute an accurate bbox from the real boundary" step the
 * original Add-City design called for).
 *
 * Ports extract-osm-amenities-tlv.ts's fetchCityBoundary query shape +
 * osmtogeojson conversion out of that standalone script and into a proper
 * server-side API route — that logic has never lived in the live admin
 * app/API surface before this (confirmed: zero references to
 * fetchCityBoundary/osmtogeojson anywhere under src/ prior to this file).
 * osmtogeojson must run server-side, never in the browser bundle.
 *
 * Returns Polygon | MultiPolygon (never narrowed to Polygon-only) — real
 * city admin boundaries (islands, exclaves) are frequently MultiPolygon.
 * This is intentionally a NEW, separately-typed surface, not a reuse of
 * LocationPicker/Authority.boundaryGeoJSON's existing Polygon-only chain —
 * see BoundaryConfirmMap.tsx's own header comment for why that chain is
 * deliberately left untouched.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
const OVERPASS_QUERY_TIMEOUT_SEC = 90;
const OVERPASS_FETCH_TIMEOUT_MS = (OVERPASS_QUERY_TIMEOUT_SEC + 20) * 1000;
const OVERPASS_RETRY_STATUSES = new Set([406, 429, 502, 503, 504]);
const OVERPASS_RETRY_DELAY_MS = 4_000;
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOverpassOnce(endpoint: string, body: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'OUT-OutRun-app (city-mapping Add-City boundary geometry; office@appout.co.il)',
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Overpass API error ${res.status}: ${text.slice(0, 300)}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpassRaw(query: string): Promise<unknown> {
  const body = 'data=' + encodeURIComponent(query);
  let lastError: unknown = null;
  for (let e = 0; e < OVERPASS_ENDPOINTS.length; e++) {
    const endpoint = OVERPASS_ENDPOINTS[e];
    for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS_PER_ENDPOINT; attempt++) {
      try {
        return await fetchOverpassOnce(endpoint, body);
      } catch (err) {
        lastError = err;
        const status = (err as Error & { status?: number }).status;
        const transient = status !== undefined && OVERPASS_RETRY_STATUSES.has(status);
        if (!transient) throw err;
        if (attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT) await sleep(OVERPASS_RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`Overpass fetch failed across all endpoints. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function computeBboxFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): { latMin: number; lonMin: number; latMax: number; lonMax: number } {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  const rings: number[][][] = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
    }
  }
  return { latMin, lonMin, latMax, lonMax };
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const relationId = Number(body.relationId);
  if (!Number.isFinite(relationId) || relationId <= 0) {
    return NextResponse.json({ error: 'relationId (positive integer OSM relation id) is required' }, { status: 400 });
  }

  const query = `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];relation(${relationId});(._;>;);out geom;`;

  try {
    const json = await fetchOverpassRaw(query);
    const geojson = osmtogeojson(json);
    const feature = geojson.features.find(
      (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
        f.id === `relation/${relationId}` && (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'),
    );
    if (!feature) {
      return NextResponse.json(
        { error: `Could not assemble a Polygon/MultiPolygon for relation/${relationId} — osmtogeojson returned ${geojson.features?.length ?? 0} feature(s).` },
        { status: 422 },
      );
    }
    const bbox = computeBboxFromGeometry(feature.geometry);
    return NextResponse.json({ geojson: feature, bbox });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'boundary geometry fetch failed' }, { status: 500 });
  }
}
