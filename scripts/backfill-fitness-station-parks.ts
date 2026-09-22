/**
 * scripts/backfill-fitness-station-parks.ts — amenities-approval-to-data
 * roadmap, item 2 backfill (docs/amenities-approval-to-data-roadmap.md).
 *
 * `functions/src/onOsmAmenityWrite.ts` only reacts to a status TRANSITION
 * into 'published' — every fitness_station already published before that
 * trigger was deployed (46 as of 22.09.2026, see the roadmap doc's dry-run
 * table) will never fire it. This script applies the exact same link/create
 * logic to those, once, per city.
 *
 * NOT auto-discovered — per-city, dry-run default, requires explicit
 * --apply, same operational shape as every other backfill in this repo
 * (extract-osm-amenities-tlv.ts, backfill-route-lighting-haifa.ts, etc.).
 * David's explicit instruction (22.09.2026): run city-by-city, ONLY after
 * the שדרות launch, with his approval before each city's --apply — because
 * the route-stops engine flag (`enable_route_stops`) is live, so a new park
 * in a city that already has routes (Herzliya/TLV) enters `resolveRouteStops`
 * immediately once created, same as any trigger-created park would.
 *
 * REUSES the trigger's own exported link/create function
 * (applyFitnessStationToParkLink) rather than reimplementing it — one
 * decision, one radius (PARK_LINK_RADIUS_METERS), used by both the live
 * trigger and this backfill. functions/src cannot import from src/, but
 * scripts/ has no such restriction in either direction — this file imports
 * from functions/src exactly like it imports from src/ elsewhere in this
 * repo.
 *
 * IDEMPOTENT: only processes docs missing `linkedParkId` — safe to re-run
 * (e.g. after a partial failure) without double-creating parks. A doc the
 * live trigger already processed (linkedParkId already set) is skipped.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints what WOULD happen per doc):
 *     npx tsx scripts/backfill-fitness-station-parks.ts --city="הרצליה"
 *
 *   LIVE RUN (writes — requires explicit --apply):
 *     npx tsx scripts/backfill-fitness-station-parks.ts --city="הרצליה" --apply
 *
 * Prerequisites: FIREBASE_SERVICE_ACCOUNT_KEY in .env.local. Run from the
 * repo root so dotenv/.env.local + relative imports (including into
 * functions/src) resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
    process.exit(1);
  }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  }
  return admin.firestore();
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const cityArg = process.argv.find((a) => a.startsWith('--city='));
  const CITY = cityArg?.slice('--city='.length);
  if (!CITY) {
    console.error('❌  --city="<name>" is required — this script is per-city by design, no default (see header: run only after שדרות, one city at a time, David\'s approval each time).');
    process.exit(1);
  }

  // initFb() MUST run — and its admin.initializeApp() complete — before
  // onOsmAmenityWrite is ever imported. That module has its own top-level
  // `if (!admin.apps.length) admin.initializeApp()` (bare, no credential —
  // correct for the Cloud Functions runtime's ambient credentials, wrong
  // for a local script). A static top-level import would run before this
  // function body and win the race, leaving admin.firestore() attached to
  // an uncredentialed default app. Dynamic import, after initFb(), makes
  // the credentialed app already exist by the time that module's own guard
  // runs, so it correctly no-ops instead of creating a second one.
  const db = initFb();
  const { findNearestPark, applyFitnessStationToParkLink, PARK_LINK_RADIUS_METERS } = await import('../functions/src/onOsmAmenityWrite');

  const mode = isApply ? 'APPLY' : 'DRY-RUN';
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  fitness_station → park backfill — ${CITY.padEnd(10)} [${mode.padEnd(8)}]  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Link radius: ${PARK_LINK_RADIUS_METERS}m (same constant the live trigger uses)`);
  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no writes. Run with --apply to write for real.\n');
  }

  const snap = await db
    .collection('osm_amenities')
    .where('city', '==', CITY)
    .where('category', '==', 'fitness_station')
    .where('status', '==', 'published')
    .get();

  console.log(`\n${snap.size} published fitness_station doc(s) for ${CITY}.`);

  const toProcess = snap.docs.filter((d) => !d.data().linkedParkId);
  const alreadyLinked = snap.size - toProcess.length;
  if (alreadyLinked > 0) {
    console.log(`${alreadyLinked} already linked (processed by the live trigger or a prior backfill run) — skipped.`);
  }
  if (toProcess.length === 0) {
    console.log('\nNothing to do.');
    process.exit(0);
  }

  let linked = 0;
  let created = 0;
  const results: Array<{ id: string; name: string | null; action: string; target: string; distanceM?: number }> = [];

  for (const doc of toProcess) {
    const data = doc.data();
    const lat = Number(data.location?.lat);
    const lng = Number(data.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      results.push({ id: doc.id, name: data.name, action: 'SKIP (no location)', target: '-' });
      continue;
    }

    if (!isApply) {
      const nearest = await findNearestPark(db, lat, lng);
      if (nearest && nearest.distanceMeters <= PARK_LINK_RADIUS_METERS) {
        results.push({ id: doc.id, name: data.name, action: 'would LINK', target: nearest.id, distanceM: Math.round(nearest.distanceMeters) });
        linked++;
      } else {
        results.push({ id: doc.id, name: data.name, action: 'would CREATE new park', target: nearest ? `nearest is ${nearest.id} at ${Math.round(nearest.distanceMeters)}m` : '(no parks at all)' });
        created++;
      }
      continue;
    }

    try {
      const result = await applyFitnessStationToParkLink(db, doc.id, data);
      // 'already-linked' means something else (the live trigger, most likely)
      // linked this exact doc between this script's initial query and this
      // iteration — the transaction inside applyFitnessStationToParkLink
      // caught it live and no-op'd rather than double-creating. Rare, but
      // real given the client-side toProcess filter above is a moment-in-
      // time snapshot, not a live guarantee.
      const label = result.action === 'linked' ? 'LINKED' : result.action === 'created' ? 'CREATED' : 'ALREADY-LINKED (race with trigger?)';
      results.push({ id: doc.id, name: data.name, action: label, target: result.parkId });
      if (result.action === 'linked') linked++;
      else if (result.action === 'created') created++;
    } catch (err) {
      results.push({ id: doc.id, name: data.name, action: 'ERROR', target: (err as Error).message });
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PER-DOC RESULT                                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const r of results) {
    console.log(`  [${r.id}] "${r.name ?? '(no name)'}" — ${r.action}${r.target !== '-' ? ` → ${r.target}` : ''}${r.distanceM != null ? ` (${r.distanceM}m)` : ''}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Processed:               ${String(toProcess.length).padEnd(31)}║`);
  console.log(`║  Linked to existing park: ${String(linked).padEnd(31)}║`);
  console.log(`║  New parks:               ${String(created).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
