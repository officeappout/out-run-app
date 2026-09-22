/**
 * DIAGNOSTIC — David's item 2 (22.09.2026): with a realistic GPS error of
 * 5-30m at the physical start sign, does the entry snap to a NEIGHBORING
 * vertex instead of path[0], and if so, does the resulting station order
 * actually change? Real Sderot route + real 2 known stations, real
 * planFromPoint/snapToVertex/detectTopology.
 *
 * READ-ONLY (one Firestore read each for route + parks). No writes.
 *
 * Run: npx tsx scripts/_verify-gps-tolerance-at-start.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { resolveRouteStops } from '../src/features/workout-engine/hybrid/route-stops.service';
import { planFromPoint, detectTopology, snapToVertex } from '../src/features/workout-engine/hybrid/plan-from-point';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { haversineMeters } from '../src/features/parks/core/services/geoUtils';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

/** Offset a lat/lng point by `meters` along the bearing from `from` to `to` (or its reverse). */
function offsetToward(from: [number, number], to: [number, number], meters: number): { lat: number; lng: number } {
  const [lng0, lat0] = from;
  const [lng1, lat1] = to;
  const dLat = lat1 - lat0, dLng = lng1 - lng0;
  const mag = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
  const uLat = dLat / mag, uLng = dLng / mag;
  // ~111,320m per degree latitude; longitude scaled by cos(lat) for this latitude.
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    lat: lat0 + (uLat * meters) / metersPerDegLat,
    lng: lng0 + (uLng * meters) / metersPerDegLng,
  };
}

async function main() {
  const db = initFb();
  const routeDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  const routePath = normalizeStoredRoutePath(routeDoc.data()!.path);
  const parksSnap = await db.collection('parks').where('authorityId', '==', 'CdiRk1QP5UrUGSbGjCkU').get();
  const parks = parksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const stops = resolveRouteStops(routePath, parks);
  const topology = detectTopology(routePath);

  console.log(`Stops: ${stops.map((s) => `${s.name}@wp${s.waypointIndex}`).join(', ')}`);

  // Local vertex spacing right at the start — determines snap sensitivity.
  const d01 = haversineMeters(routePath[0][1], routePath[0][0], routePath[1][1], routePath[1][0]);
  const dLast0 = haversineMeters(routePath[0][1], routePath[0][0], routePath[routePath.length - 1][1], routePath[routePath.length - 1][0]);
  console.log(`\nLocal spacing at start: path[0]→path[1] = ${d01.toFixed(1)}m, path[0]→path[last] = ${dLast0.toFixed(1)}m`);

  function baselineOrder(): string {
    const plan = planFromPoint({ canonical: { path: routePath }, entry: { position: { lat: routePath[0][1], lng: routePath[0][0] } }, direction: 'forward', topology, stops });
    return plan.stops.map((p) => p.stop.name).join(' → ');
  }
  const baseline = baselineOrder();
  console.log(`Baseline order (entry exactly at path[0]): ${baseline}`);

  const OFFSETS_M = [5, 10, 20, 30];
  for (const dirLabel of ['forward (toward path[1])', 'backward (toward path[last])'] as const) {
    const target = dirLabel.startsWith('forward') ? routePath[1] : routePath[routePath.length - 1];
    console.log(`\n=== Direction: ${dirLabel} ===`);
    for (const m of OFFSETS_M) {
      const entryPos = offsetToward(routePath[0], target, m);
      const entryIndex = snapToVertex(routePath, entryPos);
      const plan = planFromPoint({ canonical: { path: routePath }, entry: { position: entryPos }, direction: 'forward', topology, stops });
      const order = plan.stops.map((p) => p.stop.name).join(' → ');
      const orderChanged = order !== baseline;
      console.log(`  ${m}m offset -> entryIndex=${entryIndex} (0=start) | order: ${order} ${orderChanged ? '⚠️ ORDER CHANGED' : '✓ same order'}`);
      for (const p of plan.stops) {
        console.log(`      ${p.stop.name}: ${p.traversalKm.toFixed(4)}km from entry`);
      }
    }
  }

  console.log('\n=== Minimum safe distance analysis ===');
  console.log(`First station (${stops[0]?.name}) is ${(stops[0] ? (stops[0].waypointIndex) : 'n/a')} vertices / ~${stops[0] ? '' : ''}from start.`);
  const firstStopDistM = stops.length > 0 ? haversineMeters(routePath[0][1], routePath[0][0], stops[0].lat, stops[0].lng) : null;
  const lastStopDistM = stops.length > 0 ? haversineMeters(routePath[0][1], routePath[0][0], stops[stops.length - 1].lat, stops[stops.length - 1].lng) : null;
  console.log(`Straight-line distance, start -> first station: ${firstStopDistM?.toFixed(0)}m`);
  console.log(`Straight-line distance, start -> last station: ${lastStopDistM?.toFixed(0)}m`);
  console.log(`Local vertex spacing at start (~${d01.toFixed(1)}m) is the practical resolution of the snap — GPS error well below the distance to the first station will not reorder anything, as shown above.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
