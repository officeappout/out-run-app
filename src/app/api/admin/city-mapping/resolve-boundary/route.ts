import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/resolve-boundary — Phase 1 Stage C2 (Add
 * City), step 1. Searches OSM for admin_level=8 administrative boundaries
 * matching an operator-typed name and returns a CANDIDATE LIST — never an
 * auto-pick. Matches this codebase's repeated "never guess a name→relation
 * match" doctrine (extract-osm-amenities-tlv.ts's header comment, and this
 * same app's own city-mapping page copy) — the operator visually confirms
 * the right candidate in a later step (boundary-geometry + map render),
 * this route only narrows the field.
 *
 * Genuinely new code, not a refactor of anything existing: every other
 * Overpass-calling script in this repo resolves a boundary by an
 * ALREADY-KNOWN relation id or wikidata QID (see extract-osm-amenities-
 * tlv.ts's fetchCityBoundary, geo-discovery-routes.ts's
 * fetchAdminBoundaryPoly) — none of them search by name.
 *
 * Loose/case-insensitive regex match on name, name:he, AND name:en —
 * never exact string equality. Required because OSM's own Hebrew name
 * tags can use maqaf (‏־‎) / en-dash (–) characters that don't equal the
 * plain-hyphen strings this codebase uses elsewhere (documented
 * concretely at extract-osm-amenities-tlv.ts:62-66/165-171 — Tel Aviv's
 * name:he is "תל־אביב–יפו", this app's own canonical string is
 * "תל אביב-יפו", plain space + plain hyphen).
 *
 * Scoped to Israel via an Overpass area filter (ISO3166-1=IL) — this is a
 * search over ALL OSM admin_level=8 relations worldwide otherwise, since
 * unlike every other Overpass call in this codebase there's no bbox to
 * scope by (that's the whole point — the operator hasn't picked a
 * location yet).
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
const OVERPASS_QUERY_TIMEOUT_SEC = 25;
const OVERPASS_FETCH_TIMEOUT_MS = (OVERPASS_QUERY_TIMEOUT_SEC + 15) * 1000;
// Same retry-status set + reasoning as extract-osm-amenities-tlv.ts /
// osm-segment-importer.ts's own copies — kept as its own copy here too,
// matching this codebase's established "each OSM-calling file keeps its
// own copy of this small helper" convention (extract-osm-amenities-tlv.ts's
// header comment explains why, re: osm-segment-importer.ts).
const OVERPASS_RETRY_STATUSES = new Set([406, 429, 502, 503, 504]);
const OVERPASS_RETRY_DELAY_MS = 3_000;
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OverpassRelationElement {
  type: 'relation';
  id: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpassOnce(endpoint: string, body: string): Promise<{ elements: OverpassRelationElement[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'OUT-OutRun-app (city-mapping Add-City boundary search; office@appout.co.il)',
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
    return (await res.json()) as { elements: OverpassRelationElement[] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpassRaw(query: string): Promise<{ elements: OverpassRelationElement[] }> {
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

/** Escapes regex metacharacters so an operator-typed search term can't break
 *  the Overpass regex or (worse) turn it into something unintended. */
function escapeOverpassRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface BoundaryCandidate {
  relationId: number;
  name: string | null;
  nameHe: string | null;
  nameEn: string | null;
  adminLevel: string | null;
  wikidata: string | null;
  refIlCbs: string | null;
  center: { lat: number; lng: number } | null;
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const term = escapeOverpassRegex(name);
  const query = `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];
area["ISO3166-1"="IL"][admin_level=2]->.israel;
(
  relation["boundary"="administrative"]["admin_level"="8"]["name"~"${term}",i](area.israel);
  relation["boundary"="administrative"]["admin_level"="8"]["name:he"~"${term}",i](area.israel);
  relation["boundary"="administrative"]["admin_level"="8"]["name:en"~"${term}",i](area.israel);
);
out tags center;
`.trim();

  try {
    const json = await fetchOverpassRaw(query);
    const candidates: BoundaryCandidate[] = (json.elements ?? []).map((el) => {
      const tags = el.tags ?? {};
      return {
        relationId: el.id,
        name: tags.name ?? null,
        nameHe: tags['name:he'] ?? null,
        nameEn: tags['name:en'] ?? null,
        adminLevel: tags.admin_level ?? null,
        wikidata: tags.wikidata ?? null,
        refIlCbs: tags['ref:IL:cbs'] ?? null,
        center: el.center ? { lat: el.center.lat, lng: el.center.lon } : null,
      };
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'boundary search failed' }, { status: 500 });
  }
}
