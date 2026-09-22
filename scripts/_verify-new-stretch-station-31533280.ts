/**
 * DIAGNOSTIC — David's item 4 (22.09.2026, field-test doc 20): checks the
 * real stretch station he just entered in the admin panel
 * (31.533280, 34.599028, nature_community) against the real Sderot route +
 * the real, already-live parks in the city. Three questions:
 *   1. Within 180m of the route, and does resolveRouteStops classify/collect
 *      it as 'stretch'?
 *   2. He estimates ~160m from נאות השקמה — close to the 150m dedup radius.
 *      Does it survive the real dedup? If borderline, by how much and which
 *      direction would widen the margin?
 *   3. Order from path[0]: should land LAST, after נאות השקמה. If not, what
 *      the options are.
 *
 * READ-ONLY (two Firestore reads: route + parks, the panel entry already
 * exists — no write here). Run: npx tsx scripts/_verify-new-stretch-station-31533280.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { resolveRouteStops } from '../src/features/workout-engine/hybrid/route-stops.service';
import { planFromPoint, detectTopology } from '../src/features/workout-engine/hybrid/plan-from-point';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { haversineMeters } from '../src/features/parks/core/services/geoUtils';

/** Mirrors resolveRouteStops' own distance metric exactly (route-stops.service.ts:128-135):
 *  nearest-VERTEX haversine distance, not nearest-segment/cross-track — so this reports the
 *  same number the real 180m matching radius would compare against. */
function nearestVertexDistanceMeters(pos: { lat: number; lng: number }, path: [number, number][]): number {
  let dist = Infinity;
  for (const v of path) {
    const d = haversineMeters(pos.lat, pos.lng, v[1], v[0]);
    if (d < dist) dist = d;
  }
  return dist;
}

const TARGET_LAT = 31.533280;
const TARGET_LNG = 34.599028;

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  const db = initFb();
  const routeDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  const routePath = normalizeStoredRoutePath(routeDoc.data()!.path);
  const parksSnap = await db.collection('parks').where('authorityId', '==', 'CdiRk1QP5UrUGSbGjCkU').get();
  const parks = parksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  // Find the real panel entry by its coordinates (small tolerance for rounding).
  const target = parks.find((p) => {
    const lat = p.location?.lat, lng = p.location?.lng;
    return typeof lat === 'number' && typeof lng === 'number' &&
      Math.abs(lat - TARGET_LAT) < 0.0002 && Math.abs(lng - TARGET_LNG) < 0.0002;
  });

  if (!target) {
    console.log(`❌ No park found near (${TARGET_LAT}, ${TARGET_LNG}) in the real parks collection — has the panel entry saved yet?`);
    console.log(`   Parks fetched for this city: ${parks.length}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Found real panel entry: "${target.name}" (${target.id}), facilityType=${target.facilityType}, natureType=${target.natureType ?? '(none)'}`);
  console.log(`  Stored location: lat=${target.location.lat}, lng=${target.location.lng}`);

  // ── Q1: distance to route + classification ──
  console.log('\n=== Q1: distance to route + real classification ===');
  const distToRouteM = nearestVertexDistanceMeters({ lat: target.location.lat, lng: target.location.lng }, routePath);
  console.log(`  Nearest-vertex distance to route (same metric resolveRouteStops uses): ${distToRouteM.toFixed(1)}m (limit 180m)`);
  console.log(`  ${distToRouteM <= 180 ? '✅ within 180m' : '❌ OUTSIDE 180m — will not be picked up as a stop'}`);

  const allStops = resolveRouteStops(routePath, parks);
  const asStop = allStops.find((s) => s.parkId === target.id);
  console.log(`  Collected by resolveRouteStops? ${asStop ? `✅ yes, as '${asStop.activityType}' @${asStop.distToPathM}m` : '❌ no — did not survive resolution/dedup'}`);

  // ── Q2: distance to נאות השקמה + dedup margin ──
  console.log('\n=== Q2: distance to נאות השקמה (the nearest existing real station) + dedup margin ===');
  const naotHashikma = parks.find((p) => p.name?.includes('נאות השקמה'));
  if (naotHashikma) {
    const dReal = haversineMeters(target.location.lat, target.location.lng, naotHashikma.location.lat, naotHashikma.location.lng);
    console.log(`  Real measured distance, new station → נאות השקמה: ${dReal.toFixed(1)}m (MIN_STOP_GAP_M dedup radius = 150m)`);
    console.log(`  Margin above the 150m dedup radius: ${(dReal - 150).toFixed(1)}m`);
    if (dReal < 150) {
      console.log(`  ⚠️ INSIDE the dedup radius — the two stations will collide, one drops by preference rank (strength > core > stretch).`);
    } else if (dReal < 180) {
      console.log(`  ⚠️ Above 150m but with a thin margin (<30m) — real GPS/measurement noise could tip this either way. To widen the margin: move the new station AWAY from נאות השקמה (i.e. further along the route, back toward path[0]/the route's own bulk), by at least ${(180 - dReal).toFixed(0)}m for a comfortable ~30m+ buffer.`);
    } else {
      console.log(`  ✅ comfortable margin (${(dReal - 150).toFixed(0)}m above the dedup radius) — no collision risk from measurement noise.`);
    }
  } else {
    console.log('  ❌ could not find a park named "נאות השקמה" in this city\'s real parks — check the name.');
  }

  // ── Q3: order from path[0] ──
  console.log('\n=== Q3: station order from path[0] — should the new station be LAST? ===');
  const topology = detectTopology(routePath);
  const plan = planFromPoint({
    canonical: { path: routePath },
    entry: { position: { lat: routePath[0][1], lng: routePath[0][0] } },
    direction: 'forward',
    topology,
    stops: allStops,
  });
  console.log(`  Real order from path[0]: ${plan.stops.map((p) => p.stop.name).join(' → ')}`);
  const orderNames = plan.stops.map((p) => p.stop.name);
  const targetIdx = orderNames.findIndex((n) => n === target.name);
  if (targetIdx === -1) {
    console.log(`  ❌ new station is not in the resolved order at all (see Q1 — likely dropped by distance/dedup).`);
  } else if (targetIdx === orderNames.length - 1) {
    console.log(`  ✅ new station IS last, as required.`);
  } else {
    console.log(`  ⚠️ new station is at position ${targetIdx + 1} of ${orderNames.length}, NOT last.`);
    console.log(`  Options if it needs to be forced last: (a) move the station's coordinates further along the route past נאות השקמה relative to path[0]'s direction — order here is purely geometric (distance-from-entry), no manual override exists; (b) if the route direction can be reversed for this walk (entry at the opposite end), that would flip the whole order — separate decision, affects all stations not just this one; (c) a manual "pin this stop last" override does not exist in the code today (cooldownEligible field exists but is never read anywhere, per prior investigation) — would be new work if truly needed.`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
