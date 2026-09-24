/**
 * scripts/recalc-route-distances.ts — SCOPED distance-unit fix
 *
 * Recomputes `official_routes.distance` (KM) + `duration` (min) from the actual
 * `path` geometry (Haversine) for a SPECIFIC set of import batches — mirroring
 * `InventoryService.recalculateAllDistances` exactly, but scoped so curated /
 * published routes are never touched.
 *
 * Why: OSM importers (TLV pilot, geo-discovery) wrote `distance` in METERS, but
 * the client + player read it as KM (`setGuidedRouteDistanceKm`,
 * `RouteDetailSheet.formatDistance(km)`). This fixes those docs FROM TRUTH
 * (recompute from path), not by a blind ÷1000.
 *
 * Default scope = the two OSM batches. Pass --batch=<id> (repeatable) to override.
 *
 *   npx tsx scripts/recalc-route-distances.ts --dry-run
 *   npx tsx scripts/recalc-route-distances.ts
 *   npx tsx scripts/recalc-route-distances.ts --batch=some-other-batch
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const DRY = process.argv.includes('--dry-run');
const batchArgs = process.argv.filter(a => a.startsWith('--batch=')).map(a => a.split('=')[1]);
const BATCHES = batchArgs.length ? batchArgs : ['tlv-pilot-2026-07-07', 'zichron-geodiscovery-2026-07-10'];

// Identical Haversine to inventory.service.ts computePathDistanceMeters (path is
// [lng,lat] tuples). Stored path is {lng,lat} objects → map before calling.
function computePathDistanceMeters(path: [number, number][]): number {
  if (!path || path.length < 2) return 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [lng1, lat1] = path[i - 1];
    const [lng2, lat2] = path[i];
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total);
}

function initFb() { const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!); if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id }); return admin.firestore(); }

async function main() {
  const db = initFb();
  const col = db.collection('official_routes');
  console.log(`\n=== recalc distances (KM from path) — scoped to batches: ${BATCHES.join(', ')} ===`);
  let updated = 0, skipped = 0, unchanged = 0;

  for (const batch of BATCHES) {
    const snap = await col.where('importBatchId', '==', batch).get();
    console.log(`\nbatch ${batch}: ${snap.size} docs`);
    for (const d of snap.docs) {
      const data = d.data();
      const rawPath = data.path;
      if (!Array.isArray(rawPath) || rawPath.length < 2) { skipped++; console.log(`  ⏭  ${data.name} (no path)`); continue; }
      const path: [number, number][] = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0]);
      const km = Math.round((computePathDistanceMeters(path) / 1000) * 100) / 100;
      const activityType = (data.activityType || data.type || 'running') as string;
      const speedMpm = activityType === 'cycling' ? 250 : 100;
      const durationMinutes = Math.round((km * 1000) / speedMpm);
      const was = data.distance;
      if (was === km && data.duration === durationMinutes) { unchanged++; continue; }
      if (DRY) { console.log(`  [dry] ${String(was).padStart(6)} → ${String(km).padStart(6)} km  (${durationMinutes}m)  ${data.name}`); updated++; continue; }
      await d.ref.update({ distance: km, duration: durationMinutes, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`  ✔ ${String(was).padStart(6)} → ${String(km).padStart(6)} km  ${data.name}`);
      updated++;
    }
  }
  console.log(`\n${DRY ? '[dry-run] would update' : '✅ updated'} ${updated} | unchanged ${unchanged} | skipped ${skipped}. (curated/published routes NOT touched)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
