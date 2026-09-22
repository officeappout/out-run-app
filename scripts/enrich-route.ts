/**
 * scripts/enrich-route.ts — single-route enrichment: composition + elevation
 * + amenities tagging, in one call, for one `official_routes` doc.
 *
 * WHY THIS EXISTS: `backfill-route-quality-signals.ts` (composition),
 * `populate-route-elevation-tlv.ts` (elevation), and `tag-route-amenities.ts`
 * (amenities) are each city/DB-wide — none take a single route id. A route
 * created via the admin RouteEditor (`/admin/routes/new` →
 * `InventoryService.saveRoutes`) gets NO `qualitySignals` at all (confirmed
 * by reading both — neither sets it), so it silently misses the amenities
 * summary too (`tag-route-amenities.ts` skips `qualitySignals.amenities` for
 * any route with no existing `qualitySignals.composition` — see its own
 * header). This script exists to enrich exactly one route in one call
 * without a whole-city/whole-DB recompute.
 *
 * REUSE, NOT REIMPLEMENTATION — imports the exact same pure functions the
 * three whole-scope scripts already use, just invoked with a 1-route scope:
 *   composition → deriveCityBbox / fetchCityWayGrid / computeCityComposition
 *                 (scripts/lib/route-quality-osm-fetch.node.ts) — same as
 *                 backfill-route-quality-signals.ts, called with a bbox
 *                 around just this route's own path (a much smaller Overpass
 *                 query than a whole city).
 *   elevation   → computeDemProfile / warmDemTileCache / loadCachedTiles /
 *                 boundingBoxWithMargin (src/lib/dem-tile-cache/) — same as
 *                 populate-route-elevation-tlv.ts.
 *   amenities   → findAmenityMatchesForRoute / buildAmenitiesSignal
 *                 (route-amenity-tagging.service.ts) — same as
 *                 tag-route-amenities.ts. Amenity COVERAGE is inherently
 *                 city-scoped (the honesty rule needs "does this CITY have
 *                 any osm_amenities at all"), so this step still fetches by
 *                 the route's own `city` field — same cost as the whole-city
 *                 script for this one piece, unavoidable.
 *
 * NOT touching any of the three source scripts — everything above was
 * already factored into importable pure functions (I/O-free where noted).
 * Zero behavior change to any existing file.
 *
 * ONE COMBINED WRITE (unlike running the 3 scripts separately): because
 * composition is computed in THIS SAME call, the amenities summary is
 * attached to the SAME payload — a route enriched by this script never ends
 * up in the "no existing qualitySignals — amenities summary skipped" state
 * the whole-city amenities script would otherwise leave it in until a
 * second, separate run.
 *
 * ELEVATION DRY-RUN CAVEAT (real, not a bug): `warmDemTileCache` is called
 * with `{dryRun: !apply}` — true dry-run, unlike populate-route-elevation-
 * tlv.ts (which always warms the Storage cache for real, by its own explicit
 * design choice — see that file's header). That means in dry-run mode here,
 * elevation can only be computed from Terrain-RGB tiles ALREADY cached from
 * a prior real run; a route in a city whose tiles were never warmed will
 * show a coverage gap in dry-run even though `--apply` would successfully
 * fetch and compute it. This is printed explicitly below so it doesn't read
 * as a bug.
 *
 * SCOPE: `official_routes` only (not `curated_routes`) — matches the actual
 * need (routes created via /admin/routes/new write to official_routes via
 * InventoryService.saveRoutes).
 *
 * Usage:
 *   DRY RUN (default — no Firestore writes, no real Mapbox/Storage writes):
 *     npx tsx scripts/enrich-route.ts --routeId=<id>
 *
 *   LIVE RUN (writes composition/elevation/amenities to the route doc,
 *   and really warms the DEM tile cache):
 *     npx tsx scripts/enrich-route.ts --routeId=<id> --apply
 *
 * Prerequisites: FIREBASE_SERVICE_ACCOUNT_KEY + NEXT_PUBLIC_MAPBOX_TOKEN in
 * .env.local. Run from the repo root so dotenv/.env.local + relative
 * imports resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

import { deriveCityBbox, fetchCityWayGrid, computeCityComposition } from './lib/route-quality-osm-fetch.node';
import type { RouteComposition } from './lib/route-composition-classify';
import { warmDemTileCache, loadCachedTiles } from '../src/lib/dem-tile-cache/dem-tile-cache-admin.node';
import { computeDemProfile } from '../src/lib/dem-tile-cache/dem-sampling.service';
import { boundingBoxWithMargin } from '../src/lib/dem-tile-cache/tile-math';
import {
  findAmenityMatchesForRoute,
  buildAmenitiesSignal,
  ROUTE_AMENITY_THRESHOLDS_METERS,
  type AmenityJoinInput,
} from '../src/features/parks/core/services/route-amenity-tagging.service';
import type { AmenityCategory, CourtSport } from '../src/features/parks/core/types/osm-amenity.types';
import { buildValidatedDoc } from '../src/lib/route-collections';

const DEM_BBOX_MARGIN_METERS = 300; // same as populate-route-elevation-tlv.ts — covers bilinear-interpolation edge-neighbor needs
const AMENITY_SOURCE_STATUSES: Array<'pending' | 'published'> = ['pending', 'published']; // same sourcing rule as tag-route-amenities.ts

function initFb() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
    process.exit(1);
  }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id, storageBucket: 'appout-1.firebasestorage.app' });
  }
  return { db: admin.firestore(), storage: admin.storage() };
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const routeIdArg = process.argv.find((a) => a.startsWith('--routeId='));
  const routeId = routeIdArg?.slice('--routeId='.length);
  if (!routeId) {
    console.error('❌  --routeId=<id> is required.');
    process.exit(1);
  }

  const mode = isApply ? 'APPLY' : 'DRY-RUN';
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Single-Route Enrichment — ${routeId.padEnd(12)} [${mode.padEnd(8)}]      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (!isApply) {
    console.log('⚠️  DRY-RUN mode — official_routes will NOT be written. DEM tile cache will NOT be warmed for real (unlike populate-route-elevation-tlv.ts — see this script\'s header).');
    console.log('   Run with --apply to write.\n');
  }

  const { db, storage } = initFb();

  // ── Fetch the route ──
  const routeRef = db.collection('official_routes').doc(routeId);
  const routeSnap = await routeRef.get();
  if (!routeSnap.exists) {
    console.error(`❌  official_routes/${routeId} does not exist.`);
    process.exit(1);
  }
  const data = routeSnap.data()!;
  const routeName = data.name ?? '(unnamed)';
  const routeCity = data.city ?? '(none)';
  console.log(`📍 "${routeName}" — city: ${routeCity}, authorityId: ${data.authorityId ?? '(none)'}\n`);

  const rawPath = Array.isArray(data.path) ? data.path : [];
  if (rawPath.length < 2) {
    console.error(`❌  Route has no usable path (${rawPath.length} point(s)) — nothing to enrich.`);
    process.exit(1);
  }
  // Two different coordinate orderings, matching each consumer exactly as
  // its own source script already feeds it — NOT interchangeable:
  const pathLatLng: [number, number][] = rawPath.map((p: any) => [Number(p.lat) || 0, Number(p.lng) || 0]); // composition + elevation (backfill-route-quality-signals.ts / populate-route-elevation-tlv.ts convention)
  const pathLngLat: [number, number][] = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0]); // amenities (tag-route-amenities.ts convention)

  const existingQS = data.qualitySignals as Record<string, unknown> | undefined;
  console.log(`   existing qualitySignals: ${existingQS ? 'present' : 'ABSENT — this is exactly the "skipped" state this script fixes'}\n`);

  // ── 1. Composition (scripts/lib/route-quality-osm-fetch.node.ts — same functions backfill-route-quality-signals.ts uses) ──
  console.log('── 1. Composition ──');
  const { bboxStr } = deriveCityBbox([pathLatLng]);
  console.log(`   bbox (this route's own path + margin): ${bboxStr}`);
  console.log('   Fetching highway ways from Overpass...');
  const grid = await fetchCityWayGrid(bboxStr);
  console.log(`   ${grid.wayCount} way(s) fetched (${grid.roadWayCount} road-category).`);
  const compositionByRouteId = computeCityComposition([{ id: routeId, path: pathLatLng }], grid);
  const comp = compositionByRouteId.get(routeId)! as RouteComposition;
  const composition = {
    sidewalkPct: comp.sidewalkPct,
    genuinePct: comp.genuinePct,
    ordinaryPct: comp.ordinaryPct,
    otherPct: comp.otherPct + comp.unmatchedPct, // same merge as backfill-route-quality-signals.ts:123
  };
  console.log(`   → sidewalk=${composition.sidewalkPct}% genuine=${composition.genuinePct}% ordinary=${composition.ordinaryPct}% other=${composition.otherPct}%\n`);

  // ── 2. Elevation (src/lib/dem-tile-cache/ — same functions populate-route-elevation-tlv.ts uses) ──
  console.log('── 2. Elevation ──');
  const demPoints = pathLatLng.map(([lat, lng]) => ({ lat, lng }));
  const demBbox = boundingBoxWithMargin(demPoints, DEM_BBOX_MARGIN_METERS);
  console.log(`   bbox (+${DEM_BBOX_MARGIN_METERS}m margin): lat [${demBbox.latMin.toFixed(4)}, ${demBbox.latMax.toFixed(4)}] lon [${demBbox.lonMin.toFixed(4)}, ${demBbox.lonMax.toFixed(4)}]`);
  const warmResult = await warmDemTileCache(storage, demBbox, { dryRun: !isApply });
  console.log(`   DEM tiles: requested=${warmResult.requested} alreadyCached=${warmResult.alreadyCached} ${isApply ? 'fetchedFromMapbox' : 'wouldFetch'}=${warmResult.fetchedFromMapbox} failed=${warmResult.failed.length}`);
  if (!isApply && warmResult.alreadyCached === 0 && warmResult.fetchedFromMapbox > 0) {
    console.log('   ⚠️  None of these tiles are cached yet — dry-run cannot actually sample them (see header). Real elevation requires --apply.');
  }
  const tiles = isApply ? await loadCachedTiles(storage, demBbox) : new Map();
  const demProfile = isApply ? computeDemProfile(pathLatLng, tiles) : null;
  if (demProfile) {
    console.log(`   → elevationGain=${demProfile.elevationGainM}m maxGrade=${demProfile.maxGradePercent}%\n`);
  } else {
    console.log(`   → ${isApply ? 'DEM coverage gap — no tile data for this path' : '(not computed in dry-run — see caveat above)'}\n`);
  }

  // ── 3. Amenities tagging (route-amenity-tagging.service.ts — same functions tag-route-amenities.ts uses) ──
  console.log('── 3. Amenities tagging ──');
  const amenitiesSnap = await db.collection('osm_amenities').where('city', '==', routeCity).get();
  const hasCityCoverage = amenitiesSnap.size > 0;
  const candidates: AmenityJoinInput[] = [];
  let rejectedSkipped = 0;
  for (const d of amenitiesSnap.docs) {
    const ad = d.data();
    if (ad.status === 'rejected') { rejectedSkipped++; continue; }
    const lat = Number(ad.location?.lat);
    const lng = Number(ad.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    candidates.push({ id: d.id, category: ad.category as AmenityCategory, sport: ad.sport as CourtSport | undefined, location: { lat, lng } });
  }
  console.log(`   ${amenitiesSnap.size} osm_amenities doc(s) for "${routeCity}" (${hasCityCoverage ? 'coverage exists' : 'NO COVERAGE'}); ${candidates.length} usable (${rejectedSkipped} rejected excluded).`);
  const matches = hasCityCoverage ? findAmenityMatchesForRoute(pathLngLat, candidates) : [];
  const amenitiesSignal = buildAmenitiesSignal(hasCityCoverage, matches, AMENITY_SOURCE_STATUSES);
  const byCat: Partial<Record<AmenityCategory, number>> = {};
  for (const m of matches) byCat[m.category] = (byCat[m.category] ?? 0) + 1;
  console.log(`   → ${matches.length} match(es) [${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}] (thresholds: ${JSON.stringify(ROUTE_AMENITY_THRESHOLDS_METERS)})\n`);

  // ── Combined write payload — composition + amenities go in the SAME
  // qualitySignals write (this is the point of this script: no second
  // "route now has composition, re-run amenities tagging" pass needed) ──
  const payload: Record<string, unknown> = {
    qualitySignals: {
      composition,
      ...(existingQS?.lighting ? { lighting: existingQS.lighting } : {}), // preserved, same as backfill-route-quality-signals.ts
      amenities: { ...amenitiesSignal, computedAt: admin.firestore.FieldValue.serverTimestamp() },
      computedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'osm_overpass_v1' as const,
    },
    ...(hasCityCoverage ? { nearbyAmenities: matches } : {}), // same conditionality as tag-route-amenities.ts
    ...(demProfile ? { elevationGain: demProfile.elevationGainM, maxGrade: demProfile.maxGradePercent } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ${isApply ? 'WRITING' : 'WOULD WRITE'} — official_routes/${routeId}`.padEnd(61) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(JSON.stringify(payload, (_k, v) => (v?.constructor?.name === 'ServerTimestampTransform' ? 'FieldValue.serverTimestamp()' : v), 2));

  if (!isApply) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
    return;
  }

  const knownAuthorityIds = new Set((await db.collection('authorities').get()).docs.map((d) => d.id));
  const validated = buildValidatedDoc('official_routes', payload, {
    mode: 'update',
    knownAuthorityIds,
    existing: { authorityId: data.authorityId, city: data.city },
  });
  await routeRef.update(validated as Record<string, unknown>);
  console.log(`\n✅ Applied composition + elevation + amenities to official_routes/${routeId}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
