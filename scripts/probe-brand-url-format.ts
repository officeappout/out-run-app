/**
 * scripts/probe-brand-url-format.ts — READ ONLY, throwaway.
 * Dumps the FULL brand media URLs for the relevant items so we know the exact
 * format to write (Drive link vs Bunny/Storage) before any Phase-2 write.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const TARGETS = ['מתח רחב', 'מתח גריפ', 'מתח מדורג', 'מקבילים כנף', 'מתח מסתובב'];
async function main() {
  initFirebase();
  const db = admin.firestore();
  const snap = await db.collection('gym_equipment').get();
  for (const d of snap.docs) {
    const g = d.data() as any;
    if (!TARGETS.includes(g.name)) continue;
    console.log(`\n■ ${g.name}  (docId=${d.id})  iconKey=${g.iconKey ?? '-'}`);
    for (const b of (g.brands ?? [])) {
      console.log(`   brand=${b.brandName} brandId=${b.brandId ?? '-'}`);
      console.log(`     imageUrl: ${b.imageUrl ?? '(empty)'}`);
      console.log(`     videoUrl: ${b.videoUrl ?? '(empty)'}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
