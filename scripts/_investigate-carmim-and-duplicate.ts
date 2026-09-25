/**
 * READ-ONLY. Two checks, no writes:
 *  1. YVx4pgJjOOXR8j497pPF (official_routes) — full location data, to test
 *     whether it's actually in Sderot (כרמים neighborhood).
 *  2. W2BrOhXzngOSUOOsyNvx vs 2t5az38z4tbMFJOSVBpp — are they the same park?
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  console.log('=== 1. official_routes/YVx4pgJjOOXR8j497pPF ===');
  const routeSnap = await db.collection('official_routes').doc('YVx4pgJjOOXR8j497pPF').get();
  if (!routeSnap.exists) {
    console.log('DOES NOT EXIST');
  } else {
    const d = routeSnap.data()!;
    console.log({
      name: d.name,
      city: d.city || null,
      authorityId: d.authorityId || null,
      pathLength: Array.isArray(d.path) ? d.path.length : 0,
      firstPoint: Array.isArray(d.path) && d.path.length > 0 ? d.path[0] : null,
      lastPoint: Array.isArray(d.path) && d.path.length > 0 ? d.path[d.path.length - 1] : null,
    });
  }

  // Sderot authority coordinates, for distance comparison
  const authSnap = await db.collection('authorities').doc('CdiRk1QP5UrUGSbGjCkU').get();
  const authData = authSnap.data();
  console.log('\nSderot authority.coordinates:', authData?.coordinates || null);

  console.log('\n=== 2. W2BrOhXzngOSUOOsyNvx vs 2t5az38z4tbMFJOSVBpp ===');
  const [a, b] = await Promise.all([
    db.collection('parks').doc('W2BrOhXzngOSUOOsyNvx').get(),
    db.collection('parks').doc('2t5az38z4tbMFJOSVBpp').get(),
  ]);
  const ad = a.data();
  const bd = b.data();
  console.log('W2BrOhXzngOSUOOsyNvx:', { name: ad?.name, location: ad?.location, facilitiesCount: Array.isArray(ad?.facilities) ? ad!.facilities.length : 0, createdAt: ad?.createdAt?.toDate?.() ?? ad?.createdAt ?? null, authorityId: ad?.authorityId });
  console.log('2t5az38z4tbMFJOSVBpp:', { name: bd?.name, location: bd?.location, facilitiesCount: Array.isArray(bd?.facilities) ? bd!.facilities.length : 0, createdAt: bd?.createdAt?.toDate?.() ?? bd?.createdAt ?? null, authorityId: bd?.authorityId });
  if (ad?.location && bd?.location) {
    console.log('distance (m):', haversineM(ad.location.lat, ad.location.lng, bd.location.lat, bd.location.lng));
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
