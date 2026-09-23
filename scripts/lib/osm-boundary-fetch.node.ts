/**
 * scripts/lib/osm-boundary-fetch.node.ts — extracted verbatim from
 * scripts/extract-osm-amenities-tlv.ts (23.09.2026, city-mapping pipeline's
 * authority-boundary step) so it has ONE shared definition instead of
 * being duplicated. No logic changed — same endpoints, same retry/mirror
 * loop, same timeouts, same User-Agent, same osmtogeojson assembly. This
 * exact code has already run successfully many times (Sderot + 6 more
 * cities' boundaries fetched this way during research for this step) —
 * extracted, not rewritten.
 *
 * `.node.ts` because this does real I/O (global `fetch`, real network
 * calls) — not browser-safe, same convention as
 * scripts/lib/route-quality-osm-fetch.node.ts.
 */
import osmtogeojson from 'osmtogeojson';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
export const OVERPASS_QUERY_TIMEOUT_SEC = 60;
const OVERPASS_FETCH_TIMEOUT_MS = (OVERPASS_QUERY_TIMEOUT_SEC + 20) * 1000;
// 406 added after a live run against overpass-api.de returned it (an HTML
// "Not Acceptable" Apache error page) on the exact same query this script's
// own osm-segment-importer.ts precedent has run successfully many times —
// not a query-syntax problem on our end, so worth retrying/falling through
// to a mirror rather than aborting immediately. 429/502/503/504 alone
// weren't the full set of transient-failure statuses this public endpoint
// can return under load — confirmed empirically this run, not assumed.
const OVERPASS_RETRY_STATUSES = new Set([406, 429, 502, 503, 504]);
const OVERPASS_RETRY_DELAY_MS = 4_000;
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpassOnce(endpoint: string, body: string): Promise<{ elements: OverpassElement[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      // A real bug found live this run, not a guess: the FIRST attempt
      // against overpass-api.de returned a 429 with an explicit body —
      // "Please include a meaningful User-Agent string with your requests
      // to avoid rate-limiting" — Node's default fetch User-Agent doesn't
      // satisfy that. Fixed here; osm-segment-importer.ts's own
      // fetchOsmSegments doesn't set one either (confirmed by inspection)
      // — flagging as a real, doable follow-up for that file, not touched
      // in this run (out of this phase's scope).
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'OUT-OutRun-app (route-enrichment-pipeline osm_amenities extraction; office@appout.co.il)',
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
    return (await res.json()) as { elements: OverpassElement[] };
  } finally {
    clearTimeout(timer);
  }
}

/** Shared retry/mirror-fallback loop — used by every Overpass query in this
 *  codebase (amenity-element fetch, boundary-relation fetch, and any future
 *  caller) so the resilience logic has exactly one copy, not one per script. */
export async function fetchOverpassRaw(query: string): Promise<{ elements: OverpassElement[] }> {
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
        if (!transient) throw err; // our bug, not worth retrying
        if (attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT) await sleep(OVERPASS_RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`Overpass fetch failed across all endpoints. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * THE CITY-ACCURACY FIX (original comment, extract-osm-amenities-tlv.ts).
 * Fetches the target city's real admin_level=8 (or regional-council
 * admin_level=6) boundary (OSM relation `adminRelationId`) and assembles it
 * into a GeoJSON Polygon/MultiPolygon via osmtogeojson (`(._;>;) out geom;`
 * pulls the relation + every member way's full geometry, which osmtogeojson
 * needs to stitch the ring(s) correctly — `out geom;` alone on just the
 * relation is NOT enough). Throws if the relation can't be resolved to a
 * Polygon/MultiPolygon — a missing/broken boundary must hard-fail the run,
 * not silently fall back to bbox-only (which is the exact bug this fixes).
 */
export async function fetchCityBoundary(adminRelationId: number, city: string): Promise<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>> {
  const query = `[out:json][timeout:90];relation(${adminRelationId});(._;>;);out geom;`;
  const json = await fetchOverpassRaw(query);
  const geojson = osmtogeojson(json as any) as any;
  const feature = geojson.features.find(
    (f: any) => f.id === `relation/${adminRelationId}` && (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'),
  );
  if (!feature) {
    throw new Error(
      `Could not assemble a Polygon/MultiPolygon for ${city} admin boundary (relation/${adminRelationId}) — ` +
      `osmtogeojson returned ${geojson.features?.length ?? 0} feature(s). Aborting rather than silently falling back to bbox-only clipping.`,
    );
  }
  return feature;
}
