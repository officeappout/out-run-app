/**
 * scripts/extract-osm-amenities-tlv.ts — Stage 5 Phase C of the
 * route-enrichment-pipeline plan (autonomous city-enrichment build run,
 * 18.08.2026): the POI point-entity layer. Extracts courts (basketball/
 * football/tennis/padel via OSM's `leisure=pitch` + `sport=*`), benches,
 * drinking-water points, and fitness stations from Overpass, and writes
 * them to the new `osm_amenities` collection.
 *
 * ── THE HARD GATE (read this before changing anything below) ────────────
 * Every candidate point is checked against the ~1166 existing curated
 * `parks` docs via garden-dedup.service.ts's findNearestGardenMatch
 * BEFORE it is ever written — a point within GARDEN_DEDUP_RADIUS_METERS of
 * an existing park is written with status:'rejected' and
 * suppressedDuplicateOfParkId set, NEVER as a fresh 'pending' point. This
 * is enforced structurally in buildAmenityDoc() below — there is no code
 * path that writes a point without first running this check.
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
 * Usage:
 *   DRY RUN (default — runs Overpass + the dedup gate for real, prints
 *   every candidate + its outcome, writes NOTHING to osm_amenities):
 *     npx tsx scripts/extract-osm-amenities-tlv.ts
 *
 *   LIVE RUN (commits to osm_amenities — requires explicit --apply):
 *     npx tsx scripts/extract-osm-amenities-tlv.ts --apply
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
import { buildValidatedDoc } from '../src/lib/route-collections';
import { findAuthorityByCityName } from '../src/lib/route-collections/authority-resolution';
import { findNearestGardenMatch, GARDEN_DEDUP_RADIUS_METERS, type GardenCandidate } from '../src/features/parks/core/services/garden-dedup.service';
import { boundingBoxWithMargin } from '../src/lib/dem-tile-cache/tile-math';
import type { AmenityCategory, CourtSport, OsmAmenity } from '../src/features/parks/core/types/osm-amenity.types';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const TLV_CITY = 'תל אביב-יפו';
// Broader than Phase B's route-elevation bbox on purpose — amenities can be
// anywhere in the city, not just tight to existing route paths. Still
// derived from the same 27 real TLV routes' geometry (no hardcoded
// municipal boundary — geo-discovery-routes.ts has no TLV REGION entry at
// all, confirmed by inspection in Phase B), just with a much larger margin.
const AMENITY_BBOX_MARGIN_METERS = 2500;

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
);
out center tags;
`.trim();
  const body = 'data=' + encodeURIComponent(query);

  let lastError: unknown = null;
  for (let e = 0; e < OVERPASS_ENDPOINTS.length; e++) {
    const endpoint = OVERPASS_ENDPOINTS[e];
    for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS_PER_ENDPOINT; attempt++) {
      try {
        const json = await fetchOverpassOnce(endpoint, body);
        return json.elements ?? [];
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
  return null;
}

function elementPoint(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

interface CandidateOutcome {
  category: AmenityCategory;
  sport?: CourtSport;
  osmId: string;
  name: string | null;
  location: { lat: number; lng: number };
  suppressed: { parkId: string; distanceMeters: number } | null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  OSM Amenity Extraction — TLV only   [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('  Categories: court (basketball/football/tennis/padel), bench, drinking_water, fitness_station');
  console.log('  Scope OUT this run (deferred, per instruction): pedestrian crossings, polygon/lawn geometry, consumer-facing cycleway layer.\n');

  if (!isApply) {
    console.log('⚠️  DRY-RUN mode — osm_amenities will NOT be written.');
    console.log('   Run with --apply to write.\n');
  }

  // ── Resolve TLV's authorityId (never hardcoded — resolved live, same
  // pattern geo-discovery-routes.ts / Stage 2.4's climb backfill use) ──
  const authoritySnap = await db.collection('authorities').get();
  const authorities = authoritySnap.docs.map((d) => ({ id: d.id, name: (d.data().label as string) ?? (d.data().name as string) ?? '' }));
  const knownAuthorityIds = new Set(authorities.map((a) => a.id));
  const tlvAuthorityId = findAuthorityByCityName(TLV_CITY, authorities);
  if (!tlvAuthorityId) {
    console.error(`❌  Could not resolve an authority for "${TLV_CITY}" — aborting (never guessing an authorityId).`);
    process.exit(1);
  }
  console.log(`📍 Resolved TLV authorityId: ${tlvAuthorityId}`);

  // ── Derive extraction bbox from the 27 real TLV routes (same technique
  // as Phase B, wider margin — see header comment) ──
  const routesSnap = await db.collection('official_routes').where('city', '==', TLV_CITY).get();
  const routePoints: Array<{ lat: number; lng: number }> = [];
  for (const d of routesSnap.docs) {
    const rawPath = d.data().path;
    if (Array.isArray(rawPath)) {
      for (const p of rawPath) routePoints.push({ lat: Number(p.lat) || 0, lng: Number(p.lng) || 0 });
    }
  }
  if (routePoints.length === 0) {
    console.error('❌  No TLV route geometry found to derive a bbox from — aborting.');
    process.exit(1);
  }
  const bbox = boundingBoxWithMargin(routePoints, AMENITY_BBOX_MARGIN_METERS);
  console.log(`📍 Extraction bbox (+${AMENITY_BBOX_MARGIN_METERS}m margin around real TLV route geometry):`);
  console.log(`   lat [${bbox.latMin.toFixed(4)}, ${bbox.latMax.toFixed(4)}]  lon [${bbox.lonMin.toFixed(4)}, ${bbox.lonMax.toFixed(4)}]`);

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

  // ── Classify + dedup-gate every candidate ──
  const outcomes: CandidateOutcome[] = [];
  for (const el of elements) {
    const classified = classifyElement(el);
    if (!classified) continue;
    const point = elementPoint(el);
    if (!point) continue;
    const suppressed = findNearestGardenMatch(point, gardenCandidates, GARDEN_DEDUP_RADIUS_METERS);
    outcomes.push({
      category: classified.category,
      sport: classified.sport,
      osmId: `${el.type}_${el.id}`,
      name: el.tags?.name ?? null,
      location: point,
      suppressed,
    });
  }

  const byCategory: Record<AmenityCategory, number> = { court: 0, bench: 0, drinking_water: 0, fitness_station: 0 };
  let suppressedCount = 0;
  for (const o of outcomes) {
    byCategory[o.category]++;
    if (o.suppressed) suppressedCount++;
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  COUNTS PER AMENITY TYPE                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  court:            ${byCategory.court}`);
  console.log(`  bench:            ${byCategory.bench}`);
  console.log(`  drinking_water:   ${byCategory.drinking_water}`);
  console.log(`  fitness_station:  ${byCategory.fitness_station}`);
  console.log(`  TOTAL candidates: ${outcomes.length}`);
  console.log(`  Suppressed by garden-dedup gate: ${suppressedCount}`);
  console.log(`  Will be written as fresh 'pending': ${outcomes.length - suppressedCount}`);

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
          authorityId: tlvAuthorityId,
          city: TLV_CITY,
          importBatchId: `tlv-amenities-${new Date().toISOString().slice(0, 10)}`,
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
  console.log(`║  Candidates found:        ${String(outcomes.length).padEnd(31)}║`);
  console.log(`║  Suppressed (dedup gate): ${String(suppressedCount).padEnd(31)}║`);
  console.log(`║  Would be 'pending':      ${String(outcomes.length - suppressedCount).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
