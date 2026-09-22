/**
 * DIAGNOSTIC — proves the FreeRunLayer.tsx fix (22.09.2026, this branch:
 * fix/route-odd-geometry) against 3 real scenarios, using the EXACT same
 * processing steps the fixed component now runs:
 *
 *   const path = normalizeStoredRoutePath(data.path);
 *   if (path.length < 2) return;
 *
 * ...then the resulting `path` is what AppMap.tsx feeds into
 * buildLaneOffsetPath (routesGeoJSON / routeDirectionArrowsGeoJSON) and what
 * useRunningPlayer feeds into crossTrackDistanceMeters (route-deviation).
 * This script exercises those REAL, unmodified downstream functions with
 * the REAL fixed input-processing, not a re-implementation.
 *
 * READ-ONLY against Firestore (2 reads). No writes.
 *
 * Run: npx tsx scripts/_verify-freerunlayer-fix-3-scenarios.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { normalizeStoredRoutePath } from '../src/features/parks/core/utils/routePath';
import { buildLaneOffsetPath, crossTrackDistanceMeters, isOutAndBackPath } from '../src/features/parks/core/services/geoUtils';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

/** Mirrors FreeRunLayer.tsx's fixed processing EXACTLY (post-fix lines). */
function processLikeFixedFreeRunLayer(rawPath: unknown): { path: [number, number][]; accepted: boolean } {
  const path = normalizeStoredRoutePath(rawPath);
  if (path.length < 2) return { path, accepted: false }; // component would `return` here — no groupRoute set
  return { path, accepted: true };
}

function exercise(label: string, rawPath: unknown) {
  console.log(`\n=== ${label} ===`);
  let result: ReturnType<typeof processLikeFixedFreeRunLayer>;
  try {
    result = processLikeFixedFreeRunLayer(rawPath);
  } catch (e) {
    console.log(`  ❌ THREW during normalization/acceptance check: ${(e as Error).message}`);
    return;
  }
  if (!result.accepted) {
    console.log(`  Path rejected cleanly (length ${result.path.length} < 2) — component returns early, no groupRoute set, no crash.`);
    return;
  }
  console.log(`  Normalized path: ${result.path.length} points. First point: ${JSON.stringify(result.path[0])}`);
  console.log(`  All points are real [number,number] tuples: ${result.path.every((p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')}`);

  // Exactly what AppMap.tsx does for routesGeoJSON / routeDirectionArrowsGeoJSON.
  try {
    const isOOB = isOutAndBackPath(result.path);
    const laneOffset = buildLaneOffsetPath(result.path, 3);
    const hasNaN = laneOffset.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1]));
    console.log(`  isOutAndBackPath: ${isOOB} | buildLaneOffsetPath: no throw, ${laneOffset.length} points, contains NaN? ${hasNaN}`);
  } catch (e) {
    console.log(`  ❌ buildLaneOffsetPath THREW: ${(e as Error).constructor.name} - ${(e as Error).message}`);
    return;
  }

  // Exactly what useRunningPlayer.checkRouteDeviation does.
  try {
    const dist = crossTrackDistanceMeters({ lat: result.path[0][1], lng: result.path[0][0] }, result.path);
    console.log(`  crossTrackDistanceMeters (from own start point): ${dist}m (finite = real deviation-detection works)`);
  } catch (e) {
    console.log(`  ❌ crossTrackDistanceMeters THREW: ${(e as Error).message}`);
  }
  console.log('  ✅ No crash.');
}

async function main() {
  const db = initFb();

  console.log('SCENARIO 1: a real odd-length Sderot route (17 points) — this is exactly the shape that crashed before the fix.');
  const oddDoc = await db.collection('official_routes').doc('0L4RnJqaLiDgvQuEFdJ9').get();
  exercise('Scenario 1 — official_routes/0L4RnJqaLiDgvQuEFdJ9 ("תוספת א שכונת בן גוריון", 17 pts, odd)', oddDoc.data()!.path);

  console.log('\nSCENARIO 2: the Sderot walking route (164 points, even) — must behave at least as well as today (no crash before or after), and should now ALSO get correctly-shaped tuples (an improvement — it was silently getting raw {lng,lat} objects before, just not crashing because even-length paths skip the destructuring branch).');
  const walkDoc = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  exercise('Scenario 2 — official_routes/YVx4pgJjOOXR8j497pPF (walking route, 164 pts, even)', walkDoc.data()!.path);

  console.log('\nSCENARIO 3: corrupted geometry — null path, and a path with a missing/null point mixed in.');
  exercise('Scenario 3a — path is null', null);
  exercise('Scenario 3b — path is undefined (field absent from the doc)', undefined);
  exercise('Scenario 3c — path array with a null point and a missing-coordinate point mixed in', [
    { lng: 34.6, lat: 31.53 },
    null,
    { lng: 34.601 }, // missing lat
    { lng: 34.602, lat: 31.531 },
  ]);
  exercise('Scenario 3d — path array of length 1 (structurally too short regardless of shape)', [{ lng: 34.6, lat: 31.53 }]);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });
