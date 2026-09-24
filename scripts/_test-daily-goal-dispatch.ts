#!/usr/bin/env npx tsx
/**
 * One-off Wave-1 device test dispatcher. Scoped to David's uid only via
 * app_config/feature_flags.stepGoalTestUids (the scheduler's own test-mode
 * gate — bypasses eligibility, still exercises the real bucket-selection +
 * measurement pipeline via the real compiled Cloud Function).
 *
 * Usage: npx tsx scripts/_test-daily-goal-dispatch.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (.env.local).');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

async function run() {
  const email = 'office@appout.co.il';
  const user = await admin.auth().getUserByEmail(email);
  const uid = user.uid;
  console.log(`📱  Resolved uid for ${email}: ${uid}`);

  console.log('🚩  Setting app_config/feature_flags: stepGoalNudgeEnabled=true, stepGoalTestUids=[uid]');
  await db.doc('app_config/feature_flags').set(
    { stepGoalNudgeEnabled: true, stepGoalTestUids: [uid] },
    { merge: true },
  );

  console.log('▶️  Invoking stepGoalNudgeScheduler.run() (real compiled function, test-scoped)…');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { stepGoalNudgeScheduler } = require('../functions/lib/stepGoalNudgeScheduler');
  await stepGoalNudgeScheduler.run({} as any);

  console.log('\n🔍  Checking push_events for push_sent docs for this uid…');
  const snap = await db
    .collection('push_events')
    .where('uid', '==', uid)
    .where('eventType', '==', 'push_sent')
    .get();

  if (snap.empty) {
    console.log('⚠️  No push_sent doc found for this uid at all.');
  } else {
    const docs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => (b.data.sentAt?.toMillis?.() ?? 0) - (a.data.sentAt?.toMillis?.() ?? 0));
    console.log(`Found ${docs.length} push_sent doc(s) total — showing the most recent:`);
    console.log(`✅  push_sent doc ${docs[0].id}:`);
    console.log(JSON.stringify(docs[0].data, null, 2));
  }

  process.exit(0);
}

run().catch((e) => {
  console.error('❌  Test dispatch failed:', e);
  process.exit(1);
});
