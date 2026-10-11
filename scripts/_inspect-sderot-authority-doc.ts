/**
 * READ-ONLY — full field dump of authorities/CdiRk1QP5UrUGSbGjCkU (Sderot).
 * Also checks whether street_segments/climb_segments/route_adjacency have
 * any docs tagged to this authorityId, to locate where "city mapping" data
 * for Sderot actually landed.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set (checked .env.local via dotenv, then process.env).'); process.exit(1); }
const key = JSON.parse(rawKey);
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY present but missing project_id — check the JSON value.'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const SDEROT_ID = 'CdiRk1QP5UrUGSbGjCkU';

async function main() {
  console.log('=== authorities/CdiRk1QP5UrUGSbGjCkU — full document ===');
  const snap = await db.collection('authorities').doc(SDEROT_ID).get();
  if (!snap.exists) { console.log('DOES NOT EXIST'); return; }
  const d = snap.data()!;
  console.log('Field keys:', Object.keys(d).sort());
  console.log(JSON.stringify(d, (key, val) => {
    // Trim very long arrays (e.g. a huge boundary polygon) for readability
    if (Array.isArray(val) && val.length > 10) return `[array, length=${val.length}]`;
    return val;
  }, 2));

  console.log('\n=== city-mapping-related collections tagged to this authorityId ===');
  for (const col of ['street_segments', 'climb_segments', 'route_adjacency', 'osm_amenities']) {
    try {
      const s = await db.collection(col).where('authorityId', '==', SDEROT_ID).count().get();
      console.log(`${col}: ${s.data().count} doc(s) with authorityId == Sderot`);
    } catch (err: any) {
      console.log(`${col}: query failed — ${err.message}`);
    }
  }

  // Also check by 'city' field in case those collections key on city name, not authorityId
  for (const col of ['street_segments', 'climb_segments']) {
    try {
      const s = await db.collection(col).where('city', '==', 'שדרות').count().get();
      console.log(`${col} (by city=='שדרות'): ${s.data().count} doc(s)`);
    } catch (err: any) {
      console.log(`${col} (by city): query failed — ${err.message}`);
    }
  }
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
