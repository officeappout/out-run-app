/**
 * DIAGNOSTIC — David's item 1 (22.09.2026): in existing_route mode, does the
 * walk start from the route's own canonical start point, or from wherever
 * the user's live GPS snaps onto the loop? Proves it with the REAL,
 * unmodified planFromPoint/detectTopology/resolveRouteStops against the
 * real Sderot route + its 2 real known stations.
 *
 * READ-ONLY (one Firestore read). No writes.
 *
 * Run: npx tsx scripts/_verify-entry-point-ordering.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { resolveRouteStops } from '../src/features/workout-engine/hybrid/route-stops.service';
import { planFromPoint, detectTopology } from '../src/features/workout-engine/hybrid/plan-from-point';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';

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
  const stops = resolveRouteStops(routePath, parks); // the 2 real known stations

  const topology = detectTopology(routePath);
  console.log(`Route: ${routePath.length} points, topology=${topology}`);
  console.log(`Stops resolved: ${stops.map((s) => `${s.name}@wp${s.waypointIndex}`).join(', ')}`);

  function runScenario(label: string, entryPos: { lat: number; lng: number }) {
    const plan = planFromPoint({
      canonical: { path: routePath },
      entry: { position: entryPos },
      direction: 'forward',
      topology,
      stops,
    });
    console.log(`\n=== ${label} ===`);
    console.log(`entry snaps to canonical vertex index: ${plan.entryIndex} (0 = route's own official start point)`);
    console.log(`traversal[0] (first point of the walk as experienced): ${JSON.stringify(plan.traversal[0])}`);
    console.log(`canonical path[0] (route's official start, for comparison): ${JSON.stringify(routePath[0])}`);
    console.log(`Stop order the user will actually encounter:`);
    for (const p of plan.stops) {
      console.log(`  ${p.stop.name} — traversalIndex=${p.traversalIndex}, ${p.traversalKm.toFixed(3)}km from entry`);
    }
  }

  // Scenario A: user standing exactly at the route's own official start point
  // (path[0]) — e.g. a physical "START" sign placed there.
  runScenario('User at the route\'s OWN canonical start point (path[0])', { lat: routePath[0][1], lng: routePath[0][0] });

  // Scenario B: user starting from an arbitrary OTHER point on the loop
  // (roughly the midpoint) — e.g. walked in from home, not from the sign.
  const midIdx = Math.floor(routePath.length / 2);
  runScenario(`User starting mid-route instead (vertex ${midIdx}, NOT the sign)`, { lat: routePath[midIdx][1], lng: routePath[midIdx][0] });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
