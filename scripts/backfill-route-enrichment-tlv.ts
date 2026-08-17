/**
 * scripts/backfill-route-enrichment-tlv.ts — Stage 3 Phase 3.3 of the
 * route-enrichment-pipeline plan (17.08.2026).
 *
 * One-time backfill of the climb_segments ↔ official_routes/street_segments
 * spatial join for Tel Aviv-Yafo — the join has never run before (the live
 * dispatcher, InventoryService.recomputeEnrichmentForCities, only fires on
 * FUTURE mutations and is flag-off by default), so every eligible climb
 * needs this to get its first routeIds/streetSegmentIds/terrainFeatures/
 * nearbyClimbSegmentIds cross-refs at all. Same "existing docs predate the
 * feature" shape as scripts/backfill-route-adjacency.ts.
 *
 * Uses the REAL exported pure join functions from route-enrichment.service.ts
 * (findNearestAssociations, computeClimbRouteAssociations,
 * buildEnrichmentWritesFromAssociations, CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS)
 * — same threshold the live dispatcher will use once flipped on. Admin SDK
 * for I/O (this script runs outside any authenticated client context) —
 * NOT a call into InventoryService.recomputeRouteEnrichmentForCity itself,
 * since that function is client-SDK-bound (uses `db` from `@/lib/firebase`,
 * the browser Firestore SDK) and can't run standalone in this context. This
 * mirrors backfill-route-adjacency.ts's own precedent exactly: the PURE
 * geometry is what's actually shared across the live dispatcher and this
 * backfill, not the Firestore-facing wrapper.
 *
 * TLV ONLY — hardcoded, not a --city flag. The build-out arc is explicitly
 * TLV-prove-every-layer-first; a second city is a deliberate separate future
 * run, not a flag this script should make casually easy to widen yet.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints every pairing found):
 *     npx tsx scripts/backfill-route-enrichment-tlv.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-route-enrichment-tlv.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Phase 2.4's climb_segments authority backfill already applied (it is —
 *     180/180 TLV docs carry authorityId, 16.08.2026).
 *   - Run from the repo root so relative imports + .env.local resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { geohashQueryBounds } from 'geofire-common';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const TLV_CITY = 'תל אביב-יפו';
// Generous prefilter radius for the street_segments side — must exceed the
// real association threshold by a wide margin, same reasoning
// inventory.service.ts's own CLIMB_ROUTE_QUERY_RADIUS_METERS documents.
const SEGMENT_QUERY_RADIUS_METERS = 500;

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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  climb↔route/segment Enrichment Backfill — TLV [${mode.padEnd(8)}]  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  const {
    findNearestAssociations,
    computeClimbRouteAssociations,
    buildEnrichmentWritesFromAssociations,
    CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS,
  } = await import('../src/features/parks/core/services/route-enrichment.service');
  const { buildValidatedDoc } = await import('../src/lib/route-collections');

  console.log(`📊 Fetching authorities...`);
  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));

  console.log(`📊 Fetching climb_segments (city="${TLV_CITY}", status="published")...`);
  const climbsSnap = await db.collection('climb_segments').where('city', '==', TLV_CITY).where('status', '==', 'published').get();
  console.log(`   ${climbsSnap.size} published TLV climb(s) total.`);

  interface ClimbRow { id: string; path: [number, number][]; type: 'terrain' | 'structure' | 'stairs'; climbType: string; center?: { lat: number; lng: number }; authorityId?: string; city?: string }
  const climbs: ClimbRow[] = [];
  let climbsSkippedNoAuthority = 0, climbsSkippedNoGeometry = 0;
  for (const d of climbsSnap.docs) {
    const data = d.data();
    if (!data.authorityId) { climbsSkippedNoAuthority++; continue; } // hard rule 1 — defensive, 2.4 already backfilled all 180
    const rawGeometry = Array.isArray(data.geometry) ? data.geometry : [];
    const path: [number, number][] = rawGeometry.length > 0
      ? rawGeometry.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number])
      : data.center ? [[Number(data.center.lng) || 0, Number(data.center.lat) || 0] as [number, number]] : [];
    if (path.length === 0) { climbsSkippedNoGeometry++; continue; }
    climbs.push({ id: d.id, path, type: data.type, climbType: data.climbType, center: data.center, authorityId: data.authorityId, city: data.city });
  }
  console.log(`   ${climbs.length} eligible after filtering (${climbsSkippedNoAuthority} skipped: no authorityId; ${climbsSkippedNoGeometry} skipped: no usable geometry).`);

  console.log(`\n📊 Fetching official_routes (city="${TLV_CITY}", published=true)...`);
  const routesSnap = await db.collection('official_routes').where('city', '==', TLV_CITY).where('published', '==', true).get();
  interface RouteRow { id: string; path: [number, number][]; authorityId?: string; city?: string }
  const routes: RouteRow[] = [];
  for (const d of routesSnap.docs) {
    const data = d.data();
    const rawPath = data.path;
    if (!Array.isArray(rawPath) || rawPath.length < 2) continue;
    const path = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]);
    routes.push({ id: d.id, path, authorityId: data.authorityId, city: data.city });
  }
  console.log(`   ${routes.length} published TLV route(s) with usable geometry.`);

  const climbJoinInputs = climbs.map((c) => ({ id: c.id, path: c.path, type: c.type, climbType: c.climbType as any }));

  console.log(`\n🔍 Routes side: full cross-product (${climbs.length} climbs × ${routes.length} routes)...`);
  const routeAssociations = computeClimbRouteAssociations(climbJoinInputs, routes, CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);
  console.log(`   ${routeAssociations.length} pairing(s) found within ${CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS}m.`);

  console.log(`\n🔍 Segments side: per-climb geohash-bounded query (radius ${SEGMENT_QUERY_RADIUS_METERS}m)...`);
  const segmentAssociations: typeof routeAssociations = [];
  const segmentExistingById = new Map<string, { authorityId?: string; cityName?: string }>();
  let segmentDocsFetchedTotal = 0;
  for (const climb of climbs) {
    if (!climb.center) continue;
    const bounds = geohashQueryBounds([climb.center.lat, climb.center.lng], SEGMENT_QUERY_RADIUS_METERS);
    const seenSegmentIds = new Set<string>();
    const candidates: Array<{ id: string; path: [number, number][] }> = [];
    for (const [start, end] of bounds) {
      const segSnap = await db.collection('street_segments').orderBy('geohash').startAt(start).endAt(end).get();
      segmentDocsFetchedTotal += segSnap.size;
      for (const d of segSnap.docs) {
        if (seenSegmentIds.has(d.id)) continue;
        seenSegmentIds.add(d.id);
        const data = d.data();
        segmentExistingById.set(d.id, { authorityId: data.authorityId, cityName: data.cityName });
        const rawPath = Array.isArray(data.path) ? data.path : null;
        const path: [number, number][] = rawPath
          ? rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number])
          : data.midpoint ? [[Number(data.midpoint.lng) || 0, Number(data.midpoint.lat) || 0] as [number, number]] : [];
        if (path.length === 0) continue;
        candidates.push({ id: d.id, path });
      }
    }
    const climbInput = { id: climb.id, path: climb.path, type: climb.type, climbType: climb.climbType as any };
    segmentAssociations.push(...findNearestAssociations(climbInput, candidates, 'segment', CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS));
  }
  console.log(`   ${segmentDocsFetchedTotal} street_segments doc(s) fetched across all geohash boxes (with dedupe). ${segmentAssociations.length} pairing(s) found within ${CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS}m.`);

  const allAssociations = [...routeAssociations, ...segmentAssociations];
  const climbsById = new Map(climbJoinInputs.map((c) => [c.id, c]));
  const { climbUpdates, routeUpdates, segmentUpdates } = buildEnrichmentWritesFromAssociations(allAssociations, climbsById);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  FULL PAIRING LIST                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (allAssociations.length === 0) {
    console.log('  (none found)');
  } else {
    for (const a of allAssociations) {
      console.log(`  climb=${a.climbId}  →  ${a.targetType}=${a.targetId}  distance=${a.distanceMeters.toFixed(1)}m`);
    }
  }

  const climbsWithMatches = climbUpdates.size;
  const climbsWithZeroMatches = climbs.length - climbsWithMatches;

  console.log(`\n${isApply ? 'Applying' : '[dry-run] would apply'}: ${climbUpdates.size} climb(s), ${routeUpdates.size} route(s), ${segmentUpdates.size} segment(s) updated.`);

  if (isApply) {
    const batches: FirebaseFirestore.WriteBatch[] = [db.batch()];
    let opsInBatch = 0;
    const addOp = (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
      if (opsInBatch >= 500) { batches.push(db.batch()); opsInBatch = 0; }
      batches[batches.length - 1].update(ref, data);
      opsInBatch++;
    };

    const routeExistingById = new Map(routes.map((r) => [r.id, { authorityId: r.authorityId, city: r.city }]));
    const climbExistingById = new Map(climbs.map((c) => [c.id, { authorityId: c.authorityId, city: c.city }]));

    climbUpdates.forEach((upd, climbId) => {
      const existing = climbExistingById.get(climbId) ?? {};
      const validated = buildValidatedDoc(
        'climb_segments',
        { routeIds: upd.routeIds, streetSegmentIds: upd.streetSegmentIds, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { mode: 'update', knownAuthorityIds, existing },
      );
      addOp(db.collection('climb_segments').doc(climbId), validated as Record<string, unknown>);
    });
    routeUpdates.forEach((features, routeId) => {
      const existing = routeExistingById.get(routeId) ?? {};
      const validated = buildValidatedDoc(
        'official_routes',
        { terrainFeatures: features, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { mode: 'update', knownAuthorityIds, existing },
      );
      addOp(db.collection('official_routes').doc(routeId), validated as Record<string, unknown>);
    });
    segmentUpdates.forEach((climbIds, segmentId) => {
      const existing = segmentExistingById.get(segmentId) ?? {};
      const validated = buildValidatedDoc(
        'street_segments',
        { nearbyClimbSegmentIds: climbIds, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { mode: 'update', knownAuthorityIds, existing },
      );
      addOp(db.collection('street_segments').doc(segmentId), validated as Record<string, unknown>);
    });

    for (const batch of batches) await batch.commit();
    console.log('  ✔ committed');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Climbs eligible:         ${String(climbs.length).padEnd(31)}║`);
  console.log(`║  Climbs with ≥1 match:    ${String(climbsWithMatches).padEnd(31)}║`);
  console.log(`║  Climbs with 0 matches:   ${String(climbsWithZeroMatches).padEnd(31)}║`);
  console.log(`║  Routes gaining terrain features: ${String(routeUpdates.size).padEnd(23)}║`);
  console.log(`║  Segments gaining climb refs:     ${String(segmentUpdates.size).padEnd(23)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n✅ Dry run complete. Review the full pairing list above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/backfill-route-enrichment-tlv.ts --apply\n');
  } else {
    console.log('\n✅ Backfill committed successfully!\n');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
