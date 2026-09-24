/**
 * READ-ONLY. Counts authorities by `type` — no names, no other content.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('authorities').select('type').get();
  const byType = new Map<string, number>();
  for (const doc of snap.docs) {
    const type = doc.data().type ?? '(no type)';
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  console.log('total:', snap.size);
  console.log('by type:', Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])));
}
main();
