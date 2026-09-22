/**
 * DIAGNOSTIC — David's item 2 (22.09.2026): if a manually-placed station
 * lands within 150m (MIN_STOP_GAP_M) of one of the 2 existing gym parks
 * already on the Sderot route, which one survives resolveRouteStops'
 * proximity-dedup? Proven by execution, not by reading the sort logic.
 *
 * READ-ONLY against Firestore. The synthetic station is in-memory only —
 * never written anywhere.
 *
 * Run: npx tsx scripts/_verify-dedup-collision-simulation.ts
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
  const routePath = normalizeStoredRoutePath(routeDoc.data()!.path);
  const parksSnap = await db.collection('parks').where('authorityId', '==', 'CdiRk1QP5UrUGSbGjCkU').get();
  const realParks = parksSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  // Synthetic manual station, ~50m from "פארק כושר הכרמים - שדרות"
  // (31.531937, 34.603380), tagged the way the admin panel's
  // "nature_community" tab would tag it (spring -> stretch, rank 0).
  const syntheticManualStation = {
    id: 'MANUAL_TEST_STATION',
    name: 'תחנה ידנית לדוגמה (סימולציה, לא נשמר)',
    location: { lat: 31.53193730712863 + 50 / 111000, lng: 34.60338050047048 },
    facilityType: 'nature_community',
    natureType: 'spring',
  };

  console.log('=== Baseline (real data only) ===');
  const before = resolveRouteStops(routePath, realParks);
  for (const s of before) console.log(`  ${s.name} (${s.activityType}) @${s.distToPathM}m`);

  console.log('\n=== With the synthetic manual station added, ~50m from the strength park ===');
  const after = resolveRouteStops(routePath, [...realParks, syntheticManualStation]);
  for (const s of after) console.log(`  ${s.name} (${s.activityType}) @${s.distToPathM}m`);

  const manualSurvived = after.some((s) => s.stopId === 'poi:MANUAL_TEST_STATION');
  const strengthParkSurvived = after.some((s) => s.name === 'פארק כושר הכרמים - שדרות');
  console.log('\nDid the manual station survive?', manualSurvived);
  console.log('Did the existing strength park still survive?', strengthParkSurvived);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
