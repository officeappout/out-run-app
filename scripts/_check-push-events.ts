#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) { console.error('missing key'); process.exit(1); }
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawKey) as admin.ServiceAccount) });
}
const db = admin.firestore();

async function run() {
  const pushId = process.argv[2];
  if (!pushId) { console.error('usage: _check-push-events.ts <pushId>'); process.exit(1); }

  const snap = await db.collection('push_events').where('pushId', '==', pushId).get();
  console.log(`Found ${snap.size} event(s) for pushId=${pushId}:\n`);
  snap.docs
    .sort((a, b) => (a.data().eventType as string).localeCompare(b.data().eventType as string))
    .forEach((d) => {
      console.log(`— ${d.id}`);
      console.log(JSON.stringify(d.data(), null, 2));
      console.log('');
    });
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
