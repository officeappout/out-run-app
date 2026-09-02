/**
 * scripts/extract-osm-amenities-tlv.ts — Stage 5 Phase C of the
 * route-enrichment-pipeline plan (autonomous city-enrichment build run,
 * 18.08.2026): the POI point-entity layer. Extracts courts (basketball/
 * football/tennis/padel via OSM's `leisure=pitch` + `sport=*`), benches,
 * drinking-water points, and fitness stations from Overpass, and writes
 * them to the new `osm_amenities` collection.
 *
 * ── THE HARD GATE (read this before changing anything below) ────────────
 * fitness_station candidates ONLY are checked against the ~1166 existing
 * curated `parks` docs via garden-dedup.service.ts's findNearestGardenMatch
 * BEFORE they're ever written — a fitness_station within
 * GARDEN_DEDUP_RADIUS_METERS of an existing park is written with
 * status:'rejected' and suppressedDuplicateOfParkId set, NEVER as a fresh
 * 'pending' point. This is enforced in the classify-loop in main() below
 * (`classified.category === 'fitness_station'` gates the dedup call
 * entirely) — there is no code path that suppresses a non-fitness_station
 * candidate.
 *
 * ── DEDUP SCOPE: fitness_station ONLY (David's product decision,
 * 19.08.2026) ────────────────────────────────────────────────────────────
 * Originally every category was gated by this dedup check. Narrowed to
 * fitness_station only: park exercise equipment near an existing curated
 * park genuinely is the same thing (redundant to surface twice). Benches,
 * courts, and drinking-water fountains are NOT redundant just for sitting
 * near a park — a bench 30m from a park entrance is still a real, distinct,
 * useful amenity, and suppressing it hid genuinely useful data (56 of the
 * first 88 suppressed docs were non-fitness_station, confirmed by category
 * breakdown before this fix). Applies to every future run (Haifa included)
 * from the start — not a TLV-only patch.
 *
 * Dedup candidate list: a full `parks` collection scan (~1166 docs, small
 * enough that brute-force point-to-point comparison is fine at this scale
 * — same "brute-force is fine" precedent route-adjacency.service.ts's own
 * header comment already establishes for a comparable collection size),
 * NOT a geohash-bounded query. This deliberately sidesteps the held
 * backfill-parks-geohash.ts backfill (dry-run only, never applied —
 * still true as of this run) — `parks` docs don't need a geohash field
 * for THIS gate to work correctly today, since every doc's real
 * location.lat/lng (or legacy top-level lat/lng) is read directly. A
 * geohash-bounded query would only matter as a future SCALE optimization
 * once `parks` grows well past today's size — not a correctness
 * requirement for this TLV-scale run.
 *
 * Idempotent: doc ID is a sanitized `osmId` (e.g. `node_123456`), written
 * via `.set(..., {merge:true})` — a re-run never creates a duplicate doc
 * for the same OSM element, matching write-climb-segments-tlv.ts's own
 * deterministic-ID precedent.
 *
 * Overpass retry/mirror-fallback mechanism mirrors
 * osm-segment-importer.ts's own fetchOsmSegments (private to that file,
 * not exported — this is a fresh, smaller copy of the same pattern, not an
 * import, matching how every other OSM-ingestion script in this codebase
 * already keeps its own copy).
 *
 * ── BOUNDARY CLIP (added 19.08.2026 — city-accuracy fix) ────────────────
 * The tlv-amenities-2026-08-19 batch's extraction bbox (derived from real
 * TLV route geometry + AMENITY_BBOX_MARGIN_METERS) is a superset — it
 * spills into neighboring municipalities (Herzliya, Ramat Gan, Bnei Brak,
 * Bat Yam, Holon all confirmed present in-bbox via Overpass). Every
 * candidate is now additionally clipped against Tel Aviv-Yafo's REAL
 * admin_level=8 boundary (OSM relation 1382494 — confirmed via Overpass:
 * boundary=administrative, ref:IL:cbs=5000, wikidata=Q33935; matched by
 * relation id, NOT by name — OSM's name:he uses maqaf/en-dash characters
 * ("תל־אביב–יפו") that don't equal the plain-hyphen TLV_CITY_DEFAULT string
 * used elsewhere in this file). Fetched once per run (`(._;>;) out geom;`,
 * assembled to GeoJSON via `osmtogeojson`), then every candidate point is
 * tested with `@turf/boolean-point-in-polygon` BEFORE the garden-dedup
 * gate — a point outside the real boundary isn't a TLV amenity at all, so
 * it's dropped entirely (never written, not even as 'rejected' — that
 * status is reserved for genuine garden-dedup duplicates, a different
 * concept). Verified against 9 known reference points (central TLV
 * landmarks + neighboring city centers + Jerusalem control) before this
 * was wired in — see the task's dry-run report for those results.
 *
 * ── CITY-PARAMETERIZED (Phase 0.2, 01.09.2026) ───────────────────────────
 * --city= and --relationId= both default to TLV's hardcoded values above,
 * so a bare invocation is byte-for-byte identical to before. The bbox
 * itself needs no separate parameter — it's already derived live from that
 * city's own official_routes geometry (see below), not a hardcoded constant.
 *
 * --relationId is NOT auto-resolved from --city by name, on purpose — this
 * mirrors the exact reason TLV's own relation id is hardcoded rather than
 * name-matched (the maqaf/en-dash mismatch explained above): OSM admin-
 * boundary name matching is unreliable in general, not just for TLV. If
 * --city is passed without a matching --relationId (and it isn't the TLV
 * default), this script hard-fails BEFORE any Overpass/Firestore call —
 * silently reusing TLV's relation id to boundary-clip a different city
 * would corrupt that city's data, the same class of bug the boundary-clip
 * feature itself exists to prevent. Look up the target city's real
 * admin_level=8 relation id once (Overpass/Nominatim) and pass it explicitly.
 *
 * ── CROSSWALK/DOG_PARK REPRODUCTION (01.09.2026) ────────────────────────
 * Live `osm_amenities` holds ~2,206 category:'crossing' + ~18
 * category:'dog_park' docs, Haifa-only, importBatchId
 * `tlv-amenities-2026-08-19` — written by a lost/uncommitted run that
 * BYPASSED buildValidatedDoc entirely (neither category was a member of
 * AmenityCategory nor the mirrored zod enum until this same task's schema-
 * widening commit). This build makes that data legitimate and
 * reproducible going forward:
 *   - crossing: `highway=crossing`, node only (matches every live sample —
 *     a crossing is inherently a point on a way, never itself a way/area).
 *   - dog_park: `leisure=dog_park`, node AND way (a fenced dog park is
 *     commonly mapped as a small area; `out center tags;` below already
 *     gives every way a centroid point, same mechanism fitness_station's
 *     way candidates already use — no new geometry handling needed).
 *   - Dedup scope: BOTH skip the garden-dedup gate entirely, per the
 *     existing fitness_station-only rule above (David's product decision,
 *     19.08.2026) — a crosswalk or dog park near a curated park is not a
 *     duplicate of that park, the same reasoning already covers bench/
 *     court/drinking_water. No new code needed here: the classify-loop's
 *     `classified.category === 'fitness_station'` gate already excludes
 *     every other category, crossing/dog_park included, by construction.
 *   - The live orphaned batch's `rejected` docs (12 crossing + 2 dog_park)
 *     predate the 19.08.2026 fitness_station-only narrowing — they were
 *     written when EVERY category was gated. This build does not
 *     reproduce that since-fixed behavior: a correct dry-run against
 *     Haifa today should show 0 suppressed for both categories. The
 *     dry-run reproduction report (below) surfaces this as an expected,
 *     explained delta — not a rebuild defect.
 *
 * Usage:
 *   DRY RUN (default — runs Overpass + the dedup gate for real, prints
 *   every candidate + its outcome, writes NOTHING to osm_amenities):
 *     npx tsx scripts/extract-osm-amenities-tlv.ts                          # TLV (default)
 *
 *   LIVE RUN (commits to osm_amenities — requires explicit --apply):
 *     npx tsx scripts/extract-osm-amenities-tlv.ts --apply
 *
 *   ANOTHER CITY (relation id required — look up the real admin_level=8
 *   relation id for the target city first; <RELATION_ID> below is a
 *   placeholder, not a real value):
 *     npx tsx scripts/extract-osm-amenities-tlv.ts --city="רמת גן" --relationId=<RELATION_ID>
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so dotenv/.env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';
import osmtogeojson from 'osmtogeojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { buildValidatedDoc } from '../src/lib/route-collections';
import { findAuthorityByCityName } from '../src/lib/route-collections/authority-resolution';
import { findNearestGardenMatch, GARDEN_DEDUP_RADIUS_METERS, type GardenCandidate } from '../src/features/parks/core/services/garden-dedup.service';
import { boundingBoxWithMargin } from '../src/lib/dem-tile-cache/tile-math';
import type { AmenityCategory, CourtSport, OsmAmenity } from '../src/features/parks/core/types/osm-amenity.types';

export const TLV_CITY_DEFAULT = 'תל אביב-יפו';
export const TLV_ADMIN_RELATION_ID_DEFAULT = 1382494;
// Broader than Phase B's route-elevation bbox on purpose — amenities can be
// anywhere in the city, not just tight to existing route paths. Still
// derived from the same 27 real TLV routes' geometry (no hardcoded
// municipal boundary — geo-discovery-routes.ts has no TLV REGION entry at
// all, confirmed by inspection in Phase B), just with a much larger margin.
// This bbox is intentionally a SUPERSET of the real city (see
// fetchCityBoundary below) — the boundary clip is what enforces accuracy,
// not this margin.
const AMENITY_BBOX_MARGIN_METERS = 2500;
// TLV's own relation id (1382494) is resolved via Overpass (boundary=
// administrative, ref:IL:cbs=5000, wikidata=Q33935) — the reason it's
// hardcoded rather than name-matched (OSM's name:he for this relation is
// "תל־אביב–יפו", maqaf + en-dash, which does NOT string-equal the plain-
// hyphen "תל אביב-יפו" used elsewhere in this file/Firestore) is the same
// reasoning ADMIN_RELATION_ID above requires an explicit --relationId for
// any other city, rather than attempting name-based resolution generally.

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
const OVERPASS_QUERY_TIMEOUT_SEC = 60;
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

interface OverpassElement {
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

// Shared retry/mirror-fallback loop — used by both the amenity-element fetch
// and the boundary-relation fetch below (extracted here, previously
// inlined only in fetchAmenityElements, since the boundary fetch needs the
// exact same resilience and duplicating the loop verbatim would drift).
async function fetchOverpassRaw(query: string): Promise<{ elements: OverpassElement[] }> {
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

async function fetchAmenityElements(bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number }): Promise<OverpassElement[]> {
  const query = `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];
(
  node["leisure"="pitch"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="pitch"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["amenity"="bench"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["amenity"="drinking_water"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["leisure"="fitness_station"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="fitness_station"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["highway"="crossing"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  node["leisure"="dog_park"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
  way["leisure"="dog_park"](${bbox.latMin},${bbox.lonMin},${bbox.latMax},${bbox.lonMax});
);
out center tags;
`.trim();
  const json = await fetchOverpassRaw(query);
  return json.elements ?? [];
}

/**
 * THE CITY-ACCURACY FIX. Fetches the target city's real admin_level=8
 * boundary (OSM relation ADMIN_RELATION_ID — TLV's 1382494 by default) and
 * assembles it into a GeoJSON Polygon via osmtogeojson (`(._;>;) out geom;`
 * pulls the relation + every member way's full geometry, which osmtogeojson
 * needs to stitch the ring correctly — `out geom;` alone on just the
 * relation is NOT enough). Throws if the relation can't be resolved to a
 * Polygon/MultiPolygon — a missing/broken boundary must hard-fail the run,
 * not silently fall back to bbox-only (which is the exact bug this fixes).
 */
async function fetchCityBoundary(adminRelationId: number, city: string): Promise<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>> {
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

function isInsideCityBoundary(point: { lat: number; lng: number }, boundary: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): boolean {
  return booleanPointInPolygon(turfPoint([point.lng, point.lat]), boundary as any);
}

function classifyElement(el: OverpassElement): { category: AmenityCategory; sport?: CourtSport } | null {
  const tags = el.tags ?? {};
  if (tags.leisure === 'pitch') {
    const sportsTag = (tags.sport ?? '').split(';').map((s) => s.trim());
    let sport: CourtSport = 'unknown';
    if (sportsTag.length > 1) sport = 'multi';
    else if (sportsTag[0] === 'basketball') sport = 'basketball';
    else if (sportsTag[0] === 'soccer' || sportsTag[0] === 'football') sport = 'football';
    else if (sportsTag[0] === 'tennis') sport = 'tennis';
    else if (sportsTag[0] === 'padel' || sportsTag[0] === 'paddle_tennis') sport = 'padel';
    return { category: 'court', sport };
  }
  if (tags.amenity === 'bench') return { category: 'bench' };
  if (tags.amenity === 'drinking_water') return { category: 'drinking_water' };
  if (tags.leisure === 'fitness_station') return { category: 'fitness_station' };
  if (tags.highway === 'crossing') return { category: 'crossing' };
  if (tags.leisure === 'dog_park') return { category: 'dog_park' };
  return null;
}

function elementPoint(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

interface CandidateOutcome {
  category: AmenityCategory;
  sport?: CourtSport;
  osmId: string;
  name: string | null;
  location: { lat: number; lng: number };
  suppressed: { parkId: string; distanceMeters: number } | null;
}

/**
 * REPRODUCTION CHECK (01.09.2026, crosswalk/dog_park build) — read-only,
 * runs in every mode. Diffs this run's dry-run candidates against whatever
 * already lives in `osm_amenities` for the same city, per category: not
 * just a count comparison but an osmId-level overlap, since two runs could
 * coincidentally produce the same COUNT while finding different elements
 * (stale Overpass data, a since-edited OSM tag, etc.) — overlap is the
 * real reproduction signal, count alone is not. Generic over CITY/category
 * on purpose (no Haifa/crossing hardcoding) — this is the general-purpose
 * "does a re-run reproduce what's already live" check, Haifa+crossing/
 * dog_park is just this task's first real use of it.
 */
async function reportReproductionAgainstLive(db: admin.firestore.Firestore, city: string, outcomes: CandidateOutcome[], byCategory: Record<AmenityCategory, number>): Promise<void> {
  const liveSnap = await db.collection('osm_amenities').where('city', '==', city).get();
  const liveByCategory: Partial<Record<string, number>> = {};
  const liveOsmIdsByCategory: Partial<Record<string, Set<string>>> = {};
  for (const d of liveSnap.docs) {
    const data = d.data();
    const cat = data.category as string;
    liveByCategory[cat] = (liveByCategory[cat] ?? 0) + 1;
    (liveOsmIdsByCategory[cat] ??= new Set()).add(data.osmId as string);
  }
  const producedOsmIdsByCategory: Partial<Record<string, Set<string>>> = {};
  for (const o of outcomes) {
    (producedOsmIdsByCategory[o.category] ??= new Set()).add(o.osmId);
  }
  const allCategories = Array.from(new Set<string>([...Object.keys(byCategory), ...Object.keys(liveByCategory)]));

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  REPRODUCTION CHECK — dry-run vs LIVE osm_amenities (${city.padEnd(10)}) ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('  category          produced   live   osmId-overlap   live-only(missed)   produced-only(new)');
  for (const cat of allCategories) {
    const produced = byCategory[cat as AmenityCategory] ?? 0;
    const live = liveByCategory[cat] ?? 0;
    if (produced === 0 && live === 0) continue;
    const producedIds = producedOsmIdsByCategory[cat] ?? new Set<string>();
    const liveIds = liveOsmIdsByCategory[cat] ?? new Set<string>();
    // Array.from, not for...of a Set — this tsconfig target needs
    // --downlevelIteration to iterate Sets directly (same pre-existing
    // constraint every other Set/Map iteration in this codebase works
    // around, e.g. trio-modifiers.service.ts, warmup.service.ts).
    const overlap = Array.from(liveIds).filter((id) => producedIds.has(id)).length;
    const liveOnly = liveIds.size - overlap;
    const producedOnly = producedIds.size - overlap;
    console.log(`  ${cat.padEnd(16)}  ${String(produced).padEnd(9)}${String(live).padEnd(7)}${String(overlap).padEnd(17)}${String(liveOnly).padEnd(20)}${producedOnly}`);
  }
  console.log('  ("live-only" = a live doc this dry-run did not produce; "produced-only" = a fresh candidate not yet live.)');
}

export interface ExtractOsmAmenitiesOptions {
  city: string;
  adminRelationId: number;
  batchPrefix?: string;
  apply: boolean;
  db: admin.firestore.Firestore;
}

export interface ExtractOsmAmenitiesResult {
  rawElementCount: number;
  spilloverCount: number;
  candidateCount: number;
  suppressedCount: number;
  byCategory: Record<AmenityCategory, number>;
  writesApplied: number;
}

export async function runExtractOsmAmenities(opts: ExtractOsmAmenitiesOptions): Promise<ExtractOsmAmenitiesResult> {
  const { db } = opts;
  const CITY = opts.city;
  const ADMIN_RELATION_ID = opts.adminRelationId;
  const BATCH_PREFIX = opts.batchPrefix ?? 'tlv';
  const isApply = opts.apply;
  const mode = isApply ? 'APPLY' : 'DRY-RUN';
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  OSM Amenity Extraction — ${CITY.padEnd(12)} [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('  Categories: court (basketball/football/tennis/padel), bench, drinking_water, fitness_station, crossing, dog_park');
  console.log('  Scope OUT this run (still deferred): polygon/lawn geometry, consumer-facing cycleway layer.\n');

  if (!isApply) {
    console.log('⚠️  DRY-RUN mode — osm_amenities will NOT be written.');
    console.log('   Run with --apply to write.\n');
  }

  // ── Resolve the city's authorityId (never hardcoded — resolved live, same
  // pattern geo-discovery-routes.ts / Stage 2.4's climb backfill use) ──
  const authoritySnap = await db.collection('authorities').get();
  const authorities = authoritySnap.docs.map((d) => ({ id: d.id, name: (d.data().label as string) ?? (d.data().name as string) ?? '' }));
  const knownAuthorityIds = new Set(authorities.map((a) => a.id));
  const cityAuthorityId = findAuthorityByCityName(CITY, authorities);
  if (!cityAuthorityId) {
    throw new Error(`Could not resolve an authority for "${CITY}" — aborting (never guessing an authorityId).`);
  }
  console.log(`📍 Resolved ${CITY} authorityId: ${cityAuthorityId}`);

  // ── Derive extraction bbox from the city's own real route geometry (same
  // technique as Phase B, wider margin — see header comment) ──
  const routesSnap = await db.collection('official_routes').where('city', '==', CITY).get();
  const routePoints: Array<{ lat: number; lng: number }> = [];
  for (const d of routesSnap.docs) {
    const rawPath = d.data().path;
    if (Array.isArray(rawPath)) {
      for (const p of rawPath) routePoints.push({ lat: Number(p.lat) || 0, lng: Number(p.lng) || 0 });
    }
  }
  if (routePoints.length === 0) {
    throw new Error(`No ${CITY} route geometry found to derive a bbox from — aborting.`);
  }
  const bbox = boundingBoxWithMargin(routePoints, AMENITY_BBOX_MARGIN_METERS);
  console.log(`📍 Extraction bbox (+${AMENITY_BBOX_MARGIN_METERS}m margin around real ${CITY} route geometry):`);
  console.log(`   lat [${bbox.latMin.toFixed(4)}, ${bbox.latMax.toFixed(4)}]  lon [${bbox.lonMin.toFixed(4)}, ${bbox.lonMax.toFixed(4)}]`);
  console.log('   ⚠️  This bbox is a superset of the real city — spillover is expected and clipped below.');

  // ── Fetch the REAL city admin boundary and confirm it resolved — THE
  // city-accuracy fix. Hard-fails the run if the boundary can't be
  // assembled, rather than silently degrading to bbox-only. ──
  console.log(`\n🗺️  Fetching ${CITY} admin boundary (OSM relation ${ADMIN_RELATION_ID})...`);
  const cityBoundary = await fetchCityBoundary(ADMIN_RELATION_ID, CITY);
  const ringCount = cityBoundary.geometry.type === 'Polygon'
    ? cityBoundary.geometry.coordinates.length
    : cityBoundary.geometry.coordinates.reduce((n, poly) => n + poly.length, 0);
  console.log(`   ✔ Boundary resolved: ${cityBoundary.geometry.type}, ${ringCount} ring(s).`);

  // ── Load ALL parks for the dedup gate (brute-force at this scale — see
  // header comment for why a geohash-bounded query isn't needed today) ──
  console.log('\n🌳 Loading parks collection for the garden-dedup HARD GATE...');
  const parksSnap = await db.collection('parks').get();
  const gardenCandidates: GardenCandidate[] = [];
  for (const d of parksSnap.docs) {
    const data = d.data();
    const lat = data.location?.lat ?? data.lat;
    const lng = data.location?.lng ?? data.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      gardenCandidates.push({ id: d.id, lat, lng });
    }
  }
  console.log(`   ${gardenCandidates.length} park(s) with usable coordinates loaded (of ${parksSnap.size} total).`);

  // ── Overpass fetch ──
  console.log('\n🗺️  Querying Overpass for amenities in bbox...');
  const elements = await fetchAmenityElements(bbox);
  console.log(`   ${elements.length} raw element(s) returned.`);

  // ── Boundary-clip, then classify + dedup-gate every candidate. The
  // boundary check runs FIRST and unconditionally drops spillover — a
  // point outside the real city isn't a real amenity for this city at all,
  // so it never reaches the dedup gate and is never written in any status. ──
  const outcomes: CandidateOutcome[] = [];
  const spilloverByCategory: Record<AmenityCategory, number> = { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0 };
  let spilloverCount = 0;
  for (const el of elements) {
    const classified = classifyElement(el);
    if (!classified) continue;
    const point = elementPoint(el);
    if (!point) continue;
    if (!isInsideCityBoundary(point, cityBoundary)) {
      spilloverByCategory[classified.category]++;
      spilloverCount++;
      continue;
    }
    // Dedup scope: fitness_station only (see header comment) — benches,
    // courts, and drinking-water fountains skip this gate entirely and are
    // never suppressed for merely being near a park.
    const suppressed = classified.category === 'fitness_station'
      ? findNearestGardenMatch(point, gardenCandidates, GARDEN_DEDUP_RADIUS_METERS)
      : null;
    outcomes.push({
      category: classified.category,
      sport: classified.sport,
      osmId: `${el.type}_${el.id}`,
      name: el.tags?.name ?? null,
      location: point,
      suppressed,
    });
  }

  const byCategory: Record<AmenityCategory, number> = { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0 };
  let suppressedCount = 0;
  for (const o of outcomes) {
    byCategory[o.category]++;
    if (o.suppressed) suppressedCount++;
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  BOUNDARY CLIP (spillover dropped BEFORE dedup gate)         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  court:            ${spilloverByCategory.court}`);
  console.log(`  bench:            ${spilloverByCategory.bench}`);
  console.log(`  drinking_water:   ${spilloverByCategory.drinking_water}`);
  console.log(`  fitness_station:  ${spilloverByCategory.fitness_station}`);
  console.log(`  crossing:         ${spilloverByCategory.crossing}`);
  console.log(`  dog_park:         ${spilloverByCategory.dog_park}`);
  console.log(`  TOTAL spillover (outside real boundary, dropped): ${spilloverCount}`);
  console.log(`  Remaining candidates inside the real boundary: ${outcomes.length}`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  COUNTS PER AMENITY TYPE (inside boundary only)               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  court:            ${byCategory.court}`);
  console.log(`  bench:            ${byCategory.bench}`);
  console.log(`  drinking_water:   ${byCategory.drinking_water}`);
  console.log(`  fitness_station:  ${byCategory.fitness_station}`);
  console.log(`  crossing:         ${byCategory.crossing}`);
  console.log(`  dog_park:         ${byCategory.dog_park}`);
  console.log(`  TOTAL candidates: ${outcomes.length}`);
  console.log(`  Suppressed by garden-dedup gate: ${suppressedCount}`);
  console.log(`  Will be written as fresh 'pending': ${outcomes.length - suppressedCount}`);

  await reportReproductionAgainstLive(db, CITY, outcomes, byCategory);

  if (suppressedCount > 0) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  SUPPRESSED (matched an existing curated park)              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    for (const o of outcomes.filter((x) => x.suppressed)) {
      console.log(`  ${o.osmId} (${o.category}${o.sport ? `/${o.sport}` : ''}) "${o.name ?? '(unnamed)'}"  → park ${o.suppressed!.parkId}  distance=${o.suppressed!.distanceMeters.toFixed(1)}m`);
    }
  }

  console.log(`\n[${isApply ? 'APPLY' : 'dry-run'}] would write ${outcomes.length} osm_amenities doc(s) (${outcomes.length - suppressedCount} pending, ${suppressedCount} rejected/suppressed).`);

  if (isApply && outcomes.length > 0) {
    console.log('\n✍️  Writing to osm_amenities...');
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < outcomes.length; i += CHUNK) {
      const chunk = outcomes.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const o of chunk) {
        const doc: Partial<OsmAmenity> = {
          category: o.category,
          ...(o.sport ? { sport: o.sport } : {}),
          location: o.location,
          geohash: geohashForLocation([o.location.lat, o.location.lng]),
          osmId: o.osmId,
          name: o.name,
          status: o.suppressed ? 'rejected' : 'pending',
          origin: 'osm_import',
          authorityId: cityAuthorityId,
          city: CITY,
          importBatchId: `${BATCH_PREFIX}-amenities-${new Date().toISOString().slice(0, 10)}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(o.suppressed
            ? { suppressedDuplicateOfParkId: o.suppressed.parkId, rejectionReason: `Duplicate of existing park ${o.suppressed.parkId} (${o.suppressed.distanceMeters.toFixed(1)}m)` }
            : {}),
        };
        const validated = buildValidatedDoc('osm_amenities', doc, { mode: 'create', knownAuthorityIds });
        const docId = o.osmId.replace(/\W/g, '_');
        batch.set(db.collection('osm_amenities').doc(docId), validated as Record<string, unknown>, { merge: true });
      }
      await batch.commit();
      written += chunk.length;
      console.log(`  ✔ committed ${written}/${outcomes.length}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Raw elements (bbox):     ${String(elements.length).padEnd(31)}║`);
  console.log(`║  Spillover (boundary clip, dropped): ${String(spilloverCount).padEnd(20)}║`);
  console.log(`║  Candidates found (inside boundary): ${String(outcomes.length).padEnd(20)}║`);
  console.log(`║  Suppressed (dedup gate): ${String(suppressedCount).padEnd(31)}║`);
  console.log(`║  Would be 'pending':      ${String(outcomes.length - suppressedCount).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  return {
    rawElementCount: elements.length,
    spilloverCount,
    candidateCount: outcomes.length,
    suppressedCount,
    byCategory,
    writesApplied: isApply ? outcomes.length : 0,
  };
}

// ── CLI entry point — thin wrapper, zero behavior change ──────────────────
if (require.main === module) {
  const isApply = process.argv.includes('--apply');
  const argValue = (flag: string): string | undefined => {
    const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.slice(flag.length + 3) : undefined;
  };
  const CITY = argValue('city') ?? TLV_CITY_DEFAULT;
  const relationIdArg = argValue('relationId');
  // Hard-fail BEFORE any Overpass/Firestore call if a non-default city is
  // passed without an explicit --relationId — silently reusing TLV's
  // relation id to boundary-clip a different city would corrupt that city's
  // data (see the header comment's ── CITY-PARAMETERIZED section).
  if (CITY !== TLV_CITY_DEFAULT && !relationIdArg) {
    console.error(`❌  --city="${CITY}" was passed without --relationId=<id> — refusing to reuse TLV's relation id (${TLV_ADMIN_RELATION_ID_DEFAULT}) to boundary-clip a different city.`);
    console.error('   Look up the target city\'s real admin_level=8 OSM relation id and pass it explicitly.');
    process.exit(1);
  }
  const ADMIN_RELATION_ID = relationIdArg ? Number(relationIdArg) : TLV_ADMIN_RELATION_ID_DEFAULT;
  const BATCH_PREFIX = argValue('batchPrefix') ?? (CITY === TLV_CITY_DEFAULT ? 'tlv' : CITY.replace(/\W/g, '-'));

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  runExtractOsmAmenities({ city: CITY, adminRelationId: ADMIN_RELATION_ID, batchPrefix: BATCH_PREFIX, apply: isApply, db })
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
