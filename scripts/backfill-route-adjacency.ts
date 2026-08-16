/**
 * route_adjacency Backfill
 *
 * Populates the route_adjacency collection for every city that has
 * published official_routes corridors. Required because
 * recomputeRouteAdjacencyForCity (inventory.service.ts) only fires
 * incrementally on FUTURE official_routes create/delete events, gated
 * behind IS_ROUTE_ADJACENCY_ENABLED — while that flag has been false
 * (its entire lifetime so far), no write ever happened, so the collection
 * is currently EMPTY in production (confirmed live, 16.08.2026, during
 * user-anchored-flow verification: 0 docs). Without this backfill,
 * generateDiscoveredChainRoute / generateUserAnchoredFlowRoute's
 * multi-corridor chain-extension will always find zero edges even after
 * the flag is flipped on and firestore.rules is fixed — exactly the same
 * "existing docs predate the feature" shape as
 * scripts/backfill-street-segments-geohash.ts.
 *
 * Idempotent: uses the SAME deterministic edge id
 * ([routeIdA, routeIdB].sort().join('_')) as recomputeRouteAdjacencyForCity
 * itself, so re-running (or the real incremental hooks firing later) just
 * overwrites the same docs with the same values — never duplicates.
 *
 * Uses the REAL exported pure adjacency functions (computeCorridorAdjacency
 * from route-adjacency.service.ts) — same detection threshold
 * (ROUTE_ADJACENCY_DETECTION_THRESHOLD_METERS, 1000m) the real recompute
 * path uses. Admin SDK for I/O (this script runs outside any authenticated
 * client context); the real app's incremental hooks use the client SDK
 * exactly as inventory.service.ts already does.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints what WOULD be written):
 *     npx tsx scripts/backfill-route-adjacency.ts
 *
 *   LIVE RUN (commits changes):
 *     npx tsx scripts/backfill-route-adjacency.ts --commit
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - firestore.rules must already permit route_adjacency writes for the
 *     REAL app's incremental hooks to keep working afterward — this script
 *     uses Admin SDK (bypasses rules) so it can run either before or after
 *     that rules deploy, but the rules fix is still required separately
 *     for the feature to function for real users.
 *   - Run from the repo root so relative imports + .env.local resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const isCommit = process.argv.includes('--commit');
const mode = isCommit ? 'COMMIT' : 'DRY-RUN';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();

const DETECTION_THRESHOLD_METERS = 1000; // matches ROUTE_ADJACENCY_DETECTION_THRESHOLD_METERS in inventory.service.ts

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  route_adjacency Backfill              [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isCommit) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --commit to apply changes.\n');
  }

  const { computeCorridorAdjacency } = await import('../src/features/parks/core/services/route-adjacency.service');

  console.log('📊 Fetching all published official_routes...');
  const snap = await db.collection('official_routes').where('published', '==', true).get();
  console.log(`   ${snap.size} published corridor(s) total.\n`);

  const byCity = new Map<string, Array<{ id: string; path: [number, number][] }>>();
  let skippedNoCity = 0, skippedBadPath = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const city = data.city;
    if (!city) { skippedNoCity++; continue; }
    if (!Array.isArray(data.path) || data.path.length < 2) { skippedBadPath++; continue; }
    const path = data.path.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]);
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city)!.push({ id: d.id, path });
  }

  console.log(`🌍 ${byCity.size} distinct cities: ${Array.from(byCity.keys()).join(', ')}`);
  if (skippedNoCity > 0) console.log(`   ⚠️  ${skippedNoCity} corridor(s) skipped — no city field`);
  if (skippedBadPath > 0) console.log(`   ⚠️  ${skippedBadPath} corridor(s) skipped — missing/short path`);

  let totalEdges = 0;
  const perCityReport: string[] = [];

  for (const [city, corridors] of Array.from(byCity.entries())) {
    const edges = computeCorridorAdjacency(corridors, DETECTION_THRESHOLD_METERS);
    totalEdges += edges.length;
    perCityReport.push(`  ${city}: ${corridors.length} corridors -> ${edges.length} edges`);

    if (isCommit) {
      const batch = db.batch();
      for (const edge of edges) {
        const edgeId = [edge.routeIdA, edge.routeIdB].sort().join('_');
        batch.set(db.collection('route_adjacency').doc(edgeId), {
          routeIdA: edge.routeIdA,
          routeIdB: edge.routeIdB,
          contactA: edge.contactA,
          contactB: edge.contactB,
          gapMeters: edge.gapMeters,
          cityName: city,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      if (edges.length > 0) await batch.commit();
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║           ROUTE_ADJACENCY BACKFILL REPORT                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                  ${mode.padEnd(33)}║`);
  console.log(`║  Cities processed:      ${String(byCity.size).padEnd(33)}║`);
  console.log(`║  Total edges computed:  ${String(totalEdges).padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nPer-city breakdown:');
  perCityReport.forEach((l) => console.log(l));

  if (!isCommit) {
    console.log('\n✅ Dry run complete. Review the report above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/backfill-route-adjacency.ts --commit\n');
  } else {
    console.log('\n✅ Backfill committed successfully!\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
