/**
 * scripts/probe-park-authority.ts — READ ONLY. Diagnoses the live A3 bug:
 * getParksByAuthority filters `where('authorityId','==',uid.authorityId)`, so a
 * nearby park owned by another authority (or with no authorityId) is invisible to
 * the hybrid station search even though it sits on the route. Prints each nearby
 * park's authorityId + tenantId so we can see if they are scattered/missing.
 * Usage: npx tsx scripts/probe-park-authority.ts [lat] [lng]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const R = 6371000;
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const lat = Number(process.argv[2] ?? 32.0557), lng = Number(process.argv[3] ?? 34.7758);

  const parks = (await db.collection('parks').get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const near = parks
    .filter((p) => p.location?.lat != null && p.location?.lng != null)
    .map((p) => ({ p, d: haversine(lat, lng, p.location.lat, p.location.lng) }))
    .filter((x) => x.d <= 800)
    .sort((a, b) => a.d - b.d);

  console.log(`\n══ PARK → authorityId near ${lat},${lng} (${near.length} within 800m) ══`);
  const authCounts: Record<string, number> = {};
  for (const { p, d } of near) {
    const aid = p.authorityId ?? '(none)';
    const tid = p.tenantId ?? '(none)';
    authCounts[aid] = (authCounts[aid] ?? 0) + 1;
    const eq = (p.gymEquipment?.length ?? 0);
    console.log(`  ${d.toFixed(0)}m  "${p.name}"  authorityId=${aid} · tenantId=${tid} · ${eq} gear`);
  }
  console.log(`\ndistinct authorityId among nearby parks:`);
  for (const [aid, n] of Object.entries(authCounts)) console.log(`  ${aid}: ${n} park(s)`);
  console.log(`\n→ getParksByAuthority(X) returns ONLY parks with authorityId==X.`);
  console.log(`  If the nearby parks span multiple authorityIds (or '(none)'), the`);
  console.log(`  authority-filtered query misses the ones outside the user's authority.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
