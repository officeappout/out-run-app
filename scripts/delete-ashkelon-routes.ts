/**
 * scripts/delete-ashkelon-routes.ts — PERMANENT hard delete of all Ashkelon
 * routes (official_routes + curated_routes), with a mandatory backup and
 * downstream referential cleanup. Destructive, irreversible except via the
 * backup file this script writes.
 *
 * SCOPE (investigated live, not assumed): Ashkelon has exactly ONE
 * cityName/city spelling — "אשקלון" — confirmed against the full distinct-
 * value list across official_routes/curated_routes/street_segments/
 * route_adjacency (unlike Tel Aviv, which is split across two spellings in
 * street_segments — that's a separate, unrelated, already-logged debt item,
 * not a concern here). ASHKELON_CITY below is the single source of truth
 * for the match value.
 *
 * DOWNSTREAM CLEANUP: investigated live — Ashkelon has ZERO street_segments
 * (neither route-broadcast `officialRouteId`-tagged docs NOR ingested-OSM
 * `osmId`-tagged docs — osm-segment-importer.ts was never run for
 * Ashkelon) and ZERO route_adjacency edges (consistent with 0 published
 * routes: broadcastRouteToStreetSegments/recomputeAdjacencyForCities only
 * ever fire on approveRoute, and every Ashkelon route is still
 * pending/archived). The script still QUERIES both collections live on
 * every run (never hardcodes "0") so a future change in that state is
 * caught, not silently assumed.
 *
 * BACKUP: written (or refreshed) on EVERY run, dry-run or apply — it's a
 * pure export, zero risk. --apply re-reads the just-written file and
 * verifies its record count matches the live query count before deleting
 * anything, so "backup written and verified before the first delete" holds
 * regardless of whether a prior dry-run already produced one.
 *
 * Usage:
 *   npx tsx scripts/delete-ashkelon-routes.ts             # dry-run (default)
 *   npx tsx scripts/delete-ashkelon-routes.ts --apply     # real, irreversible delete
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const ASHKELON_CITY = 'אשקלון';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const db = initFb();
  console.log(`=== Ashkelon route deletion — ${APPLY ? '🔴 APPLY (irreversible)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  // ── Scope confirmation: distinct city values, to catch any spelling drift since the last check ──
  const [officialAllSnap, curatedAllSnap] = await Promise.all([
    db.collection('official_routes').select('city').get(),
    db.collection('curated_routes').select('city').get(),
  ]);
  const cityValues = new Set([...officialAllSnap.docs, ...curatedAllSnap.docs].map((d) => d.data().city));
  const ashkelonLikeValues = Array.from(cityValues).filter((c) => c && c.includes('אשקלון'));
  console.log(`Distinct city values containing "אשקלון": ${JSON.stringify(ashkelonLikeValues)}`);
  if (ashkelonLikeValues.length !== 1 || ashkelonLikeValues[0] !== ASHKELON_CITY) {
    console.error(`❌ ABORT — expected exactly one value ("${ASHKELON_CITY}"), found ${JSON.stringify(ashkelonLikeValues)}. Investigate before proceeding; do not broaden the match blindly.`);
    process.exit(1);
  }
  console.log('✅ Single confirmed spelling, matches ASHKELON_CITY.\n');

  // ── Fetch the actual routes to delete ──
  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').where('city', '==', ASHKELON_CITY).get(),
    db.collection('curated_routes').where('city', '==', ASHKELON_CITY).get(),
  ]);
  const routes: Array<{ id: string; collection: 'official_routes' | 'curated_routes'; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }> = [
    ...officialSnap.docs.map((d) => ({ id: d.id, collection: 'official_routes' as const, ref: d.ref, data: d.data() })),
    ...curatedSnap.docs.map((d) => ({ id: d.id, collection: 'curated_routes' as const, ref: d.ref, data: d.data() })),
  ];
  const routeIds = new Set(routes.map((r) => r.id));
  console.log(`Routes to delete: ${routes.length} (${officialSnap.size} official_routes + ${curatedSnap.size} curated_routes)\n`);

  const statusCounts = new Map<string, number>();
  const publishedRoutes: Array<{ id: string; collection: string; name: string }> = [];
  for (const r of routes) {
    const status = r.data.status || '(none)';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (r.data.published === true) publishedRoutes.push({ id: r.id, collection: r.collection, name: r.data.name });
  }
  console.log('Status breakdown:', Array.from(statusCounts.entries()));
  console.log(`published===true: ${publishedRoutes.length}`);
  if (publishedRoutes.length > 0) {
    console.log('\n⚠️  PUBLISHED (live to users) ROUTES — review before proceeding:');
    publishedRoutes.forEach((r) => console.log(`  [${r.collection}/${r.id}] "${r.name}"`));
  } else {
    console.log('✅ No published routes among the deletion set — nothing currently live to users.');
  }

  // ── Downstream: route-broadcast street_segments (officialRouteId in deletion set) ──
  // Chunked 'in' queries (Firestore cap: 30 values per query).
  const routeIdChunks = chunk(Array.from(routeIds), 30);
  const segmentsToDelete: FirebaseFirestore.DocumentReference[] = [];
  for (const idChunk of routeIdChunks) {
    const snap = await db.collection('street_segments').where('officialRouteId', 'in', idChunk).get();
    segmentsToDelete.push(...snap.docs.map((d) => d.ref));
  }
  console.log(`\nstreet_segments referencing a deleted route (officialRouteId match): ${segmentsToDelete.length}`);

  // Sanity check: confirm Ashkelon's ingested-OSM street_segments (osmId-tagged, cityName===ASHKELON_CITY) are untouched by construction — this query targets officialRouteId only, never osmId, but verify the count independently.
  const ashkelonOsmSegSnap = await db.collection('street_segments').where('cityName', '==', ASHKELON_CITY).get();
  console.log(`street_segments with cityName==="${ASHKELON_CITY}" (ingested OSM infra — must remain untouched): ${ashkelonOsmSegSnap.size}`);

  // ── Downstream: route_adjacency edges (routeIdA or routeIdB in deletion set) ──
  const adjacencyToDelete: FirebaseFirestore.DocumentReference[] = [];
  const adjAllSnap = await db.collection('route_adjacency').get(); // small collection (88 docs total, city-wide) — cheaper to scan once than 2x chunked 'in' queries per side
  for (const d of adjAllSnap.docs) {
    const data = d.data();
    if (routeIds.has(data.routeIdA) || routeIds.has(data.routeIdB)) adjacencyToDelete.push(d.ref);
  }
  console.log(`route_adjacency edges referencing a deleted route: ${adjacencyToDelete.length}`);

  // ── Backup — written every run, dry-run or apply ──
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(outDir, `ashkelon-routes-backup-${dateStr}.json`);
  const backupPayload = {
    generatedAt: new Date().toISOString(),
    ashkelonCity: ASHKELON_CITY,
    routeCount: routes.length,
    routes: routes.map((r) => ({ id: r.id, collection: r.collection, data: r.data })),
    downstream: {
      streetSegments: segmentsToDelete.length > 0 ? await Promise.all(segmentsToDelete.map(async (ref) => { const d = await ref.get(); return { id: d.id, data: d.data() }; })) : [],
      routeAdjacency: adjacencyToDelete.length > 0 ? await Promise.all(adjacencyToDelete.map(async (ref) => { const d = await ref.get(); return { id: d.id, data: d.data() }; })) : [],
    },
  };
  fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2));
  console.log(`\nBackup written: ${backupPath}`);

  // Verify the backup immediately — re-read it back and confirm the record count matches.
  const reread = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const backupOk = reread.routes.length === routes.length;
  console.log(`Backup verification: ${backupOk ? '✅ OK' : '❌ MISMATCH'} (expected ${routes.length} routes, backup file has ${reread.routes.length})`);
  if (!backupOk) { console.error('❌ ABORT — backup verification failed. Not proceeding.'); process.exit(1); }

  console.log(`\n=== ${APPLY ? 'Would delete' : 'Would delete (dry-run preview)'}: ${routes.length} route(s), ${segmentsToDelete.length} street_segments, ${adjacencyToDelete.length} route_adjacency edge(s) ===`);

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to execute the delete for real (irreversible except via the backup above).');
    return;
  }

  console.log('\n🔴 Applying deletes...');
  const allRefsToDelete = [...segmentsToDelete, ...adjacencyToDelete, ...routes.map((r) => r.ref)]; // downstream first, route docs last
  for (const refChunk of chunk(allRefsToDelete, 500)) {
    const batch = db.batch();
    refChunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    console.log(`  deleted ${refChunk.length} doc(s)`);
  }

  console.log('\n=== Post-delete verification ===');
  const [officialAfter, curatedAfter] = await Promise.all([
    db.collection('official_routes').where('city', '==', ASHKELON_CITY).get(),
    db.collection('curated_routes').where('city', '==', ASHKELON_CITY).get(),
  ]);
  console.log(`Ashkelon routes remaining: ${officialAfter.size + curatedAfter.size} (expect 0)`);

  const segmentsAfterChunks = await Promise.all(routeIdChunks.map((idChunk) => db.collection('street_segments').where('officialRouteId', 'in', idChunk).get()));
  const segmentsAfter = segmentsAfterChunks.reduce((s, snap) => s + snap.size, 0);
  console.log(`Orphaned route-broadcast street_segments remaining: ${segmentsAfter} (expect 0)`);

  const adjAfterSnap = await db.collection('route_adjacency').get();
  const adjAfter = adjAfterSnap.docs.filter((d) => routeIds.has(d.data().routeIdA) || routeIds.has(d.data().routeIdB)).length;
  console.log(`Orphaned route_adjacency edges remaining: ${adjAfter} (expect 0)`);

  const ashkelonOsmSegAfter = await db.collection('street_segments').where('cityName', '==', ASHKELON_CITY).get();
  console.log(`Ashkelon-cityName street_segments after delete: ${ashkelonOsmSegAfter.size} (expect ${ashkelonOsmSegSnap.size}, unchanged)`);

  const allOk = (officialAfter.size + curatedAfter.size) === 0 && segmentsAfter === 0 && adjAfter === 0 && ashkelonOsmSegAfter.size === ashkelonOsmSegSnap.size;
  console.log(`\n${allOk ? '✅ All post-delete checks passed.' : '❌ SOME CHECKS FAILED — investigate before considering this complete.'}`);
  console.log(`Restore path if needed: ${backupPath}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
