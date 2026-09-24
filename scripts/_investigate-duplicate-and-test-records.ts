/**
 * READ-ONLY — two checks, no writes:
 *  1. Find any existing `parks` doc near (32.060283, 34.772347) and/or
 *     named like "מסילה", EXCLUDING ahTKeHLdPtrbgqi3tbyM itself — to see if
 *     that doc is a duplicate of a real, already-tracked park.
 *  2. Count + list names of `parks` and route docs (official_routes,
 *     curated_routes) whose name contains "בדיקה" or "test" (case-insensitive).
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const TARGET = { lat: 32.060283478526884, lng: 34.772347131478426 };
const EXCLUDE_ID = 'ahTKeHLdPtrbgqi3tbyM';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  console.log('=== 1. Search for an existing "פארק המסילה"-like park ===');
  const parksSnap = await db.collection('parks').get();
  const candidates: Array<{ id: string; name: string; dist: number | null; published: any; contentStatus: any; facilitiesCount: number }> = [];

  for (const doc of parksSnap.docs) {
    if (doc.id === EXCLUDE_ID) continue;
    const d = doc.data();
    const name: string = d.name || '';
    const loc = d.location;
    const dist = loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
      ? haversineM(TARGET.lat, TARGET.lng, loc.lat, loc.lng)
      : null;
    const nameMatches = name.includes('מסילה') || name.includes('רכבת');
    const closeby = dist !== null && dist <= 400;
    if (nameMatches || closeby) {
      candidates.push({
        id: doc.id,
        name,
        dist,
        published: d.published ?? null,
        contentStatus: d.contentStatus ?? null,
        facilitiesCount: Array.isArray(d.facilities) ? d.facilities.length : 0,
      });
    }
  }
  candidates.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
  console.log(`Found ${candidates.length} candidate(s) (name contains מסילה/רכבת, or within 400m):`);
  for (const c of candidates) console.log(c);

  console.log('\n=== 2. "בדיקה"/"test" name scan — counts + names only ===');
  for (const col of ['parks', 'official_routes', 'curated_routes']) {
    const snap = await db.collection(col).get();
    const matches: string[] = [];
    for (const doc of snap.docs) {
      const name: string = (doc.data().name || '').toString();
      if (name.includes('בדיקה') || /test/i.test(name)) {
        matches.push(`${doc.id} :: "${name}"`);
      }
    }
    console.log(`\n${col}: ${matches.length} match(es) out of ${snap.size} total docs`);
    matches.forEach((m) => console.log('  ' + m));
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
