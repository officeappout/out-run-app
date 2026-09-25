/**
 * READ-ONLY. Counts pairs of `parks` docs within various distance
 * thresholds of each other — counts only, no names, no ids printed.
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
  const snap = await db.collection('parks').select('location').get();
  const points: Array<{ lat: number; lng: number }> = [];
  for (const doc of snap.docs) {
    const loc = doc.data().location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) points.push({ lat: loc.lat, lng: loc.lng });
  }
  console.log('total parks with valid coordinates:', points.length, 'of', snap.size);

  const thresholds = [50, 100, 200, 300];
  const pairCounts = new Map<number, number>();
  const parksInvolvedSets = new Map<number, Set<number>>();
  for (const t of thresholds) { pairCounts.set(t, 0); parksInvolvedSets.set(t, new Set()); }

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = haversineM(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      for (const t of thresholds) {
        if (d <= t) {
          pairCounts.set(t, (pairCounts.get(t) ?? 0) + 1);
          parksInvolvedSets.get(t)!.add(i);
          parksInvolvedSets.get(t)!.add(j);
        }
      }
    }
  }

  console.log('\n=== Pairs within threshold, and distinct parks involved (counts only) ===');
  for (const t of thresholds) {
    console.log(`<= ${t}m: ${pairCounts.get(t)} pair(s), ${parksInvolvedSets.get(t)!.size} distinct park(s) involved`);
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
