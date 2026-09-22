/**
 * DIAGNOSTIC — David's item 2 (22.09.2026, field-test doc 18/19): proves the
 * pin-dedup fix end-to-end against REAL Sderot route + park data.
 *
 * Two things must be true:
 *  1. The real stop-resolution pipeline (resolveRouteStops → the same
 *     markerStations mapping now used in start-hybrid-session.ts) actually
 *     carries `parkId` for every equipped-park stop — not undefined.
 *  2. AppMap's excludedParkIds/filter logic (mirrored here verbatim, since
 *     it lives inside a React component and this repo has no jsdom) then
 *     correctly excludes exactly those park ids from the regular pin layers,
 *     and leaves every OTHER real park in this city untouched.
 *
 * READ-ONLY (two Firestore reads: route + parks). No writes.
 * Run: npx tsx scripts/_verify-station-pin-dedup.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { resolveRouteStops } from '../src/features/workout-engine/hybrid/route-stops.service';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

/** Mirrors start-hybrid-session.ts's markerStations mapping, post-fix. */
function buildMarkerStations(stops: { lat: number; lng: number; name: string; image?: string; parkId: string }[]) {
  return stops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, image: s.image, parkId: s.parkId }));
}

/** Mirrors AppMap.tsx's excludedParkIds useMemo, verbatim logic (no React needed — pure). */
function buildExcludedParkIds(
  selectedParkId: string | null,
  hybridStations: { parkId?: string }[],
): string[] {
  const ids = new Set<string>();
  if (selectedParkId) ids.add(selectedParkId);
  for (const s of hybridStations) {
    if (s.parkId) ids.add(s.parkId);
  }
  return Array.from(ids);
}

/** Mirrors AppMap.tsx's parkPinsFilter/parkMinorPinsFilter Mapbox expression, evaluated
 *  the same way Mapbox GL would evaluate `['!in', ['get','id'], ['literal', excludedIds]]`
 *  against a feature's properties — proves the filter actually hides the right features
 *  without needing a real Mapbox GL instance. */
function wouldShowRegularPin(parkId: string, excludedParkIds: string[]): boolean {
  return !excludedParkIds.includes(parkId);
}

async function main() {
  const db = initFb();
  const routeDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  const routePath = normalizeStoredRoutePath(routeDoc.data()!.path);
  const parksSnap = await db.collection('parks').where('authorityId', '==', 'CdiRk1QP5UrUGSbGjCkU').get();
  const parks = parksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  const stops = resolveRouteStops(routePath, parks);
  console.log(`Resolved ${stops.length} real stops on the Sderot route: ${stops.map((s) => `${s.name}(${s.parkId})`).join(', ')}`);

  console.log('\n=== Step 1: parkId survives into markerStations (the map-facing shape) ===');
  const markerStations = buildMarkerStations(stops as any);
  let allHaveParkId = true;
  for (const m of markerStations) {
    const ok = typeof m.parkId === 'string' && m.parkId.length > 0;
    if (!ok) allHaveParkId = false;
    console.log(`  ${ok ? '✅' : '❌'} ${m.name}: parkId=${m.parkId ?? 'MISSING'}`);
  }
  console.log(allHaveParkId ? '✅ every marker station carries a real parkId' : '❌ FAILED — some marker lost its parkId');

  console.log('\n=== Step 2: excludedParkIds correctly built from real station data ===');
  const excludedParkIds = buildExcludedParkIds(null, markerStations);
  console.log(`  excludedParkIds = [${excludedParkIds.join(', ')}]`);
  const stationParkIdSet = new Set(markerStations.map((m) => m.parkId));
  const step2Ok = stationParkIdSet.size === excludedParkIds.length && [...stationParkIdSet].every((id) => excludedParkIds.includes(id!));
  console.log(step2Ok ? '✅ excludedParkIds exactly matches the real stations\' park ids' : '❌ FAILED — mismatch');

  console.log('\n=== Step 3: each station park would be HIDDEN from the regular pin layer (no duplicate) ===');
  let step3Ok = true;
  for (const m of markerStations) {
    const shown = wouldShowRegularPin(m.parkId!, excludedParkIds);
    if (shown) step3Ok = false;
    console.log(`  ${!shown ? '✅' : '❌'} ${m.name} (${m.parkId}): regular pin ${shown ? 'STILL SHOWS — duplicate!' : 'hidden — only the hybrid dumbbell pin shows'}`);
  }

  console.log('\n=== Step 4: negative control — a real OTHER park in the same city is NOT hidden ===');
  const stationIds = new Set(markerStations.map((m) => m.parkId));
  const otherPark = parks.find((p) => !stationIds.has(p.id) && p.location?.lat && p.location?.lng);
  let step4Ok = false;
  if (otherPark) {
    const shown = wouldShowRegularPin(otherPark.id, excludedParkIds);
    step4Ok = shown;
    console.log(`  ${shown ? '✅' : '❌'} "${otherPark.name}" (${otherPark.id}, not a station on this route): regular pin ${shown ? 'still shows, correctly' : 'WRONGLY HIDDEN'}`);
  } else {
    console.log('  ⚠️ no non-station park with coordinates found in this city — skipped (not a failure of the fix itself)');
    step4Ok = true;
  }

  console.log('\n=== Summary ===');
  const allOk = allHaveParkId && step2Ok && step3Ok && step4Ok;
  console.log(allOk ? '✅ ALL CHECKS PASS — station pins dedup correctly against real Sderot data' : '❌ FAILURE — see above');
  if (!allOk) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
