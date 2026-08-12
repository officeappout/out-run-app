/** READ-ONLY: dump the exact current hiit_friendly set (rollback snapshot). */
import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
(async () => {
  const snap = await db.collection('exercises').get();
  const ids = snap.docs.filter((d) => ((d.data() as any).tags ?? []).includes('hiit_friendly')).map((d) => d.id);
  console.log(JSON.stringify(ids));
  process.exit(0);
})();
