/**
 * STOP-AND-VERIFY — David caught that everything tested so far assumed
 * official_routes/YVx4pgJjOOXR8j497pPF (164 pts) IS "מסלול הכלניות", the
 * route the municipality is physically signposting. Never confirmed.
 * READ-ONLY. No writes. Run: npx tsx scripts/_verify-kalaniyot-route-identity.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { resolveRouteStops } from '../src/features/workout-engine/hybrid/route-stops.service';
import { planFromPoint, detectTopology, snapToVertex } from '../src/features/workout-engine/hybrid/plan-from-point';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { haversineMeters } from '../src/features/parks/core/services/geoUtils';

const SDEROT_AUTHORITY = 'CdiRk1QP5UrUGSbGjCkU';
const KNOWN_164PT_ROUTE_ID = 'YVx4pgJjOOXR8j497pPF';
const STRETCH_STATION = { lat: 31.533280, lng: 34.599028 };

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

/** Same nearest-VERTEX distance metric resolveRouteStops uses internally. */
function nearestVertexDistanceMeters(pos: { lat: number; lng: number }, path: [number, number][]): number {
  let dist = Infinity;
  for (const v of path) {
    const d = haversineMeters(pos.lat, pos.lng, v[1], v[0]);
    if (d < dist) dist = d;
  }
  return dist;
}

async function main() {
  const db = initFb();

  // ── Q1: identity of the known 164-pt route ──
  console.log('=== Q1: is official_routes/' + KNOWN_164PT_ROUTE_ID + ' "מסלול הכלניות"? ===');
  const knownDoc = await db.collection('official_routes').doc(KNOWN_164PT_ROUTE_ID).get();
  if (!knownDoc.exists) { console.log('❌ doc does not exist'); return; }
  const knownData = knownDoc.data()!;
  const knownPath = normalizeStoredRoutePath(knownData.path);
  console.log(`  name: "${knownData.name}"`);
  console.log(`  id: ${knownDoc.id}`);
  console.log(`  points: ${knownPath.length}`);
  console.log(`  type/activityType: ${knownData.type ?? knownData.activityType ?? '(none)'}`);
  console.log(`  distance (km): ${knownData.distance}`);
  const isKalaniyot164 = (knownData.name ?? '').includes('כלני');
  console.log(`  ${isKalaniyot164 ? '✅' : '❌'} name ${isKalaniyot164 ? 'DOES' : 'does NOT'} contain "כלני"`);

  // ── Q2: search for the real Kalaniyot route among all Sderot official_routes ──
  console.log('\n=== Q2: searching all Sderot official_routes for "כלני" in the name ===');
  const allSderotSnap = await db.collection('official_routes').where('authorityId', '==', SDEROT_AUTHORITY).get();
  const allSderotRoutes = allSderotSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  console.log(`  Total official_routes for Sderot: ${allSderotRoutes.length}`);
  const kalaniyotMatches = allSderotRoutes.filter((r) => (r.name ?? '').includes('כלני'));
  console.log(`  Routes with "כלני" in the name: ${kalaniyotMatches.length}`);
  for (const r of kalaniyotMatches) {
    const path = normalizeStoredRoutePath(r.path);
    console.log(`    - "${r.name}" (${r.id}) — ${path.length} pts, type=${r.type ?? r.activityType ?? '(none)'}, distance=${r.distance}km`);
  }

  if (kalaniyotMatches.length === 0) {
    console.log('  ❌ NO route with "כלני" found among Sderot official_routes. Listing ALL Sderot route names for manual inspection:');
    for (const r of allSderotRoutes) {
      console.log(`    - "${r.name}" (${r.id})`);
    }
    console.log('\n⚠️ Cannot proceed to Q3/Q4/Q5 without identifying the real Kalaniyot route. Stopping here — report this back.');
    return;
  }

  // Use the first (or only) match as "the" Kalaniyot route for the rest of this script.
  const kalaniyot = kalaniyotMatches[0];
  const kalaniyotPath = normalizeStoredRoutePath(kalaniyot.path);
  const isSameAsKnown = kalaniyot.id === KNOWN_164PT_ROUTE_ID;
  console.log(`\n  → Using "${kalaniyot.name}" (${kalaniyot.id}) as the real Kalaniyot route.`);
  console.log(`  → ${isSameAsKnown ? '✅ SAME as the 164-pt route already tested' : '❌ DIFFERENT route — everything tested so far was against the wrong route'}`);

  console.log('\n  Full profile:');
  console.log(`    id: ${kalaniyot.id}`);
  console.log(`    name: "${kalaniyot.name}"`);
  console.log(`    points: ${kalaniyotPath.length} (${kalaniyotPath.length % 2 === 0 ? 'even' : 'ODD'})`);
  console.log(`    type/activityType: ${kalaniyot.type ?? kalaniyot.activityType ?? '(none)'}, activityTypes=${JSON.stringify(kalaniyot.activityTypes ?? null)}`);
  console.log(`    distance: ${kalaniyot.distance} km`);
  const geomValid = kalaniyotPath.length >= 2 && kalaniyotPath.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  console.log(`    geometry valid: ${geomValid ? '✅ yes' : '❌ NO — has invalid points'}`);
  console.log(`    path[0]: lat=${kalaniyotPath[0][1]}, lng=${kalaniyotPath[0][0]}`);

  // ── Q3: re-run all station checks against Kalaniyot ──
  console.log('\n=== Q3a: stretch station (31.533280, 34.599028) vs Kalaniyot ===');
  const stretchDist = nearestVertexDistanceMeters(STRETCH_STATION, kalaniyotPath);
  console.log(`  Nearest-vertex distance to Kalaniyot: ${stretchDist.toFixed(1)}m (limit 180m)`);
  console.log(`  ${stretchDist <= 180 ? '✅ within 180m — would be collected' : '❌ outside 180m — will NOT be collected'}`);

  console.log('\n=== Q3b: הכרמים + נאות השקמה — are they even near Kalaniyot? ===');
  const carmim = allSderotRoutes.length >= 0
    ? (await db.collection('parks').where('authorityId', '==', SDEROT_AUTHORITY).get()).docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
    : [];
  const parks = carmim;
  const carmimPark = parks.find((p) => p.name?.includes('הכרמים'));
  const naotHashikma = parks.find((p) => p.name?.includes('נאות השקמה'));
  for (const [label, park] of [['פארק כושר הכרמים', carmimPark], ['נאות השקמה', naotHashikma]] as const) {
    if (!park) { console.log(`  ❌ "${label}" not found in parks collection`); continue; }
    const d = nearestVertexDistanceMeters({ lat: park.location.lat, lng: park.location.lng }, kalaniyotPath);
    console.log(`  ${label}: ${d.toFixed(1)}m from Kalaniyot — ${d <= 180 ? '✅ within 180m' : '❌ outside 180m'}`);
  }

  console.log('\n=== Q3c: resolveRouteStops real output on Kalaniyot ===');
  const stopsOnKalaniyot = resolveRouteStops(kalaniyotPath, parks);
  console.log(`  Collected ${stopsOnKalaniyot.length} real stop(s): ${stopsOnKalaniyot.map((s) => `${s.name}(${s.activityType}@${s.distToPathM}m)`).join(', ') || '(none)'}`);

  console.log('\n=== Q3d: GPS tolerance at Kalaniyot path[0] ===');
  const d01 = kalaniyotPath.length > 1 ? haversineMeters(kalaniyotPath[0][1], kalaniyotPath[0][0], kalaniyotPath[1][1], kalaniyotPath[1][0]) : NaN;
  console.log(`  Local vertex spacing path[0]→path[1]: ${d01.toFixed(1)}m`);
  const topology = detectTopology(kalaniyotPath);
  console.log(`  Topology: ${topology}`);
  for (const m of [5, 10, 20, 30]) {
    const target = kalaniyotPath.length > 1 ? kalaniyotPath[1] : kalaniyotPath[0];
    const [lng0, lat0] = kalaniyotPath[0];
    const [lng1, lat1] = target;
    const dLat = lat1 - lat0, dLng = lng1 - lng0;
    const mag = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
    const metersPerDegLat = 111_320, metersPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
    const entryPos = { lat: lat0 + (dLat / mag) * m / metersPerDegLat, lng: lng0 + (dLng / mag) * m / metersPerDegLng };
    const entryIdx = snapToVertex(kalaniyotPath, entryPos);
    console.log(`    ${m}m offset → entryIndex=${entryIdx}`);
  }

  console.log('\n=== Q3e: station order from Kalaniyot path[0] ===');
  if (stopsOnKalaniyot.length > 0) {
    const plan = planFromPoint({
      canonical: { path: kalaniyotPath },
      entry: { position: { lat: kalaniyotPath[0][1], lng: kalaniyotPath[0][0] } },
      direction: 'forward',
      topology,
      stops: stopsOnKalaniyot,
    });
    console.log(`  Order: ${plan.stops.map((p) => p.stop.name).join(' → ')}`);
  } else {
    console.log('  (no stops collected — see Q3c)');
  }

  // ── Q4: does existing_route actually pick Kalaniyot when the user stands at its path[0]? ──
  console.log('\n=== Q4: existing_route selection — standing at Kalaniyot path[0], which route wins? ===');
  console.log('  Mirrors resolveRouteStopsBackbone(\'existing_route\', ...) EXACTLY: nearest-VERTEX');
  console.log('  distance search across ALL official_routes network-wide (no authority filter — confirmed');
  console.log('  in start-hybrid-session.ts:646-676, getCachedOfficialRoutes() has no authorityId param).');
  const allRoutesSnap = await db.collection('official_routes').get();
  const allRoutes = allRoutesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  console.log(`  Total official_routes network-wide: ${allRoutes.length}`);
  const userPos = { lat: kalaniyotPath[0][1], lng: kalaniyotPath[0][0] };
  let best: { id: string; name?: string; d: number } | null = null;
  for (const r of allRoutes) {
    const path = normalizeStoredRoutePath(r.path);
    if (path.length < 2) continue;
    let d = Infinity;
    for (const v of path) {
      const dv = haversineMeters(userPos.lat, userPos.lng, v[1], v[0]);
      if (dv < d) d = dv;
    }
    if (!best || d < best.d) best = { id: r.id, name: r.name, d };
  }
  console.log(`  Winner: "${best?.name}" (${best?.id}) @ ${best?.d.toFixed(1)}m`);
  console.log(`  ${best?.id === kalaniyot.id ? '✅ Kalaniyot wins, as expected' : '❌ A DIFFERENT route wins — existing_route would NOT pick Kalaniyot even standing at its own start point!'}`);
  // Show the top 5 closest for context (are there near-ties / overlapping routes nearby?)
  const ranked = allRoutes
    .map((r) => {
      const path = normalizeStoredRoutePath(r.path);
      if (path.length < 2) return null;
      let d = Infinity;
      for (const v of path) { const dv = haversineMeters(userPos.lat, userPos.lng, v[1], v[0]); if (dv < d) d = dv; }
      return { id: r.id, name: r.name, d };
    })
    .filter((x): x is { id: string; name?: string; d: number } => x !== null)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  console.log('  Top 5 nearest routes network-wide from this exact point:');
  for (const r of ranked) console.log(`    ${r.d.toFixed(1)}m — "${r.name}" (${r.id})`);

  // ── Q5: type tagging — does it matter to the flow? ──
  console.log('\n=== Q5: does Kalaniyot\'s type/activityType tagging affect the flow? ===');
  console.log(`  Kalaniyot's type: ${kalaniyot.type ?? '(none)'}, activityType: ${kalaniyot.activityType ?? '(none)'}`);
  console.log('  Code fact (start-hybrid-session.ts:646-677, resolveRouteStopsBackbone existing_route branch):');
  console.log('  the nearest-vertex search iterates ALL routes from getCachedOfficialRoutes() with NO type/');
  console.log('  activityType/activityTypes filter anywhere in that branch — selection is 100% geometric');
  console.log('  (nearest single vertex), regardless of tagging. If Kalaniyot is untagged or tagged for a');
  console.log('  different activity, it can still be selected as the route_stops backbone exactly the same.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
