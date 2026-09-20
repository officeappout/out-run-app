/**
 * DIAGNOSTIC — resolves David's contradiction (20.09.2026): does
 * resolveRouteStops() only work on a freshly-generated loop, or can it take
 * a REAL official_routes document's path directly?
 *
 * Runs the REAL, unmodified resolveRouteStops() on the REAL Sderot walking
 * route (official_routes/YVx4pgJjOOXR8j497pPF, 164 points) and the REAL 48
 * Sderot parks fetched live from Firestore. No mocks, no synthetic data —
 * this is the exact geometry and the exact facility data that exist today.
 *
 * READ-ONLY. No writes.
 *
 * Run: npx tsx scripts/_verify-resolveroutestops-on-sderot-official-route.ts
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

async function main() {
  const db = initFb();

  const routeDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  const rawPath = routeDoc.data()!.path;
  const routePath = normalizeStoredRoutePath(rawPath); // real doc is {lng,lat} objects — normalize like any correct reader must
  console.log(`Sderot walking route: ${routePath.length} normalized points (raw doc had ${Array.isArray(rawPath) ? rawPath.length : 'N/A'})`);

  const authId = 'CdiRk1QP5UrUGSbGjCkU'; // שדרות, confirmed in prior queries
  const parksSnap = await db.collection('parks').where('authorityId', '==', authId).get();
  const parks = parksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  console.log(`Sderot real parks fetched: ${parks.length} (all previously confirmed facilityType='gym_park')`);

  console.log('\n=== Calling the REAL resolveRouteStops(routePath, parks) — default 180m radius ===');
  const stops = resolveRouteStops(routePath, parks);
  console.log(`Stops returned: ${stops.length}`);
  for (const s of stops) {
    console.log(`  - stopId=${s.stopId} name="${s.name}" activityType=${s.activityType} waypointIndex=${s.waypointIndex} distToPathM=${s.distToPathM} equipment=${JSON.stringify(s.availableEquipment)}`);
  }

  console.log('\n=== Same call, wider radius (500m) — sanity check in case 180m is just too tight for this specific route ===');
  const stopsWide = resolveRouteStops(routePath, parks, { matchRadiusMeters: 500 });
  console.log(`Stops returned at 500m: ${stopsWide.length}`);
  for (const s of stopsWide) {
    console.log(`  - stopId=${s.stopId} name="${s.name}" activityType=${s.activityType} waypointIndex=${s.waypointIndex} distToPathM=${s.distToPathM}`);
  }

  console.log('\n=== Verdict ===');
  console.log('resolveRouteStops was called with the REAL official_routes path (not a generated loop) and REAL parks data.');
  console.log('It does not know or care where routePath came from — this proves/disproves the capability directly.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
