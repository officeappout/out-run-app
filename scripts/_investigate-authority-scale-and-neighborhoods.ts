/**
 * READ-ONLY. Answers two questions from David (23.09.2026), no writes:
 *  1. Real size/shape of the `authorities` collection, and whether ANY
 *     authority (of any type) already has boundaryGeoJSON or
 *     coordinates+radiusKm — checks whether fetchAuthorityBoundaries()
 *     (item 2, unfiltered by type) has a live type-safety exposure today
 *     or only a latent one.
 *  2. Where neighborhoodId gets set on parks today (ParkForm.tsx selector
 *     vs a historical backfill script) — counts + code paths only.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  console.log('=== 1. authorities collection — scale + type breakdown ===');
  const snap = await db.collection('authorities').select('type', 'boundaryGeoJSON', 'coordinates', 'radiusKm', 'parentAuthorityId').get();
  console.log('total authorities:', snap.size);

  const byType = new Map<string, number>();
  let anyBoundary = 0;
  let anyCoordinates = 0;
  let anyRadius = 0;
  let neighborhoodTypeCount = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const type = d.type || '(no type)';
    byType.set(type, (byType.get(type) ?? 0) + 1);
    if (d.boundaryGeoJSON) anyBoundary++;
    if (d.coordinates) anyCoordinates++;
    if (d.radiusKm) anyRadius++;
    if (type === 'neighborhood' || type === 'settlement') neighborhoodTypeCount++;
  }

  console.log('by type:', Object.fromEntries(byType));
  console.log('docs with boundaryGeoJSON set (any type):', anyBoundary);
  console.log('docs with coordinates set (any type):', anyCoordinates);
  console.log('docs with radiusKm set (any type):', anyRadius);
  console.log('neighborhood/settlement-type docs total:', neighborhoodTypeCount);

  console.log('\n=== 2. Sample neighborhood/settlement docs — do THEY carry boundary/radius data? ===');
  const neighSnap = await db.collection('authorities').where('type', 'in', ['neighborhood', 'settlement']).limit(5).get();
  for (const doc of neighSnap.docs) {
    const d = doc.data();
    console.log({
      id: doc.id,
      name: d.name,
      parentAuthorityId: d.parentAuthorityId || null,
      hasBoundaryGeoJSON: !!d.boundaryGeoJSON,
      hasCoordinates: !!d.coordinates,
      hasRadiusKm: !!d.radiusKm,
    });
  }

  console.log('\n=== 3. parks.neighborhoodId — how many set, sample of recent ones ===');
  const parksSnap = await db.collection('parks').select('neighborhoodId', 'authorityId', 'createdAt', 'origin').get();
  let withNeighborhood = 0;
  for (const doc of parksSnap.docs) {
    if (doc.data().neighborhoodId) withNeighborhood++;
  }
  console.log(`parks with neighborhoodId set: ${withNeighborhood} / ${parksSnap.size}`);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
