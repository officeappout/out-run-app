/**
 * scripts/inspect-tab-locks-account.ts
 *
 * READ-ONLY. Prints exactly the fields resolveTabLocks(profile)
 * (src/lib/resolveTabLocks.ts → hasStrengthTrack/hasRunningTrack,
 * src/lib/track-ownership.ts) reads for one account, so the 07.09.2026
 * "lock didn't render" investigation can compare what the signal actually
 * was against what resolveTabLocks would have computed from it.
 *
 * Not run yet — prepared per David's instruction, waiting on an email/uid
 * for the account he tested with. Do not guess an identifier and do not
 * run this against a different account "to check the mechanism" — the
 * whole point is this specific account's data at the moment in question.
 *
 * Usage:
 *   npx tsx scripts/inspect-tab-locks-account.ts --email=someone@example.com
 *   npx tsx scripts/inspect-tab-locks-account.ts --uid=abc123
 *
 * No --write flag exists. This script never mutates Firestore.
 */

import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();
const auth = admin.auth();

function readLevel(v: { currentLevel?: number; level?: number } | null | undefined): number {
  return v == null ? 0 : (v.currentLevel ?? v.level ?? 0);
}

async function run() {
  const emailArg = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
  const uidArg = process.argv.find((a) => a.startsWith('--uid='))?.split('=')[1];

  if (!emailArg && !uidArg) {
    console.error('Usage: npx tsx scripts/inspect-tab-locks-account.ts --email=<email> | --uid=<uid>');
    process.exit(1);
  }

  const uid = uidArg ?? (await auth.getUserByEmail(emailArg!)).uid;
  console.log(`uid: ${uid}`);

  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    console.log('No users/{uid} document exists for this account.');
    return;
  }
  const data = snap.data() as any;

  const running = data.running ?? {};
  const domains = data.progression?.domains ?? {};
  const tracks = data.progression?.tracks ?? {};

  console.log('');
  console.log('── hasRunningTrack input ──────────────────────────────');
  console.log(`running.isUnlocked: ${JSON.stringify(running.isUnlocked)}`);
  console.log(`(hasRunningTrack would return: ${!!running.isUnlocked})`);

  console.log('');
  console.log('── hasStrengthTrack input ─────────────────────────────');
  const NON_STRENGTH = new Set(['running', 'flexibility']);
  console.log('progression.domains:');
  for (const [key_, value] of Object.entries(domains)) {
    const level = readLevel(value as any);
    const counts = !NON_STRENGTH.has(key_) && level > 0;
    console.log(`  ${key_}: currentLevel/level=${level}${counts ? '  <- counts toward hasStrengthTrack' : ''}`);
  }
  console.log('progression.tracks:');
  for (const [key_, value] of Object.entries(tracks)) {
    const level = readLevel(value as any);
    const counts = !NON_STRENGTH.has(key_) && level > 0;
    console.log(`  ${key_}: currentLevel/level=${level}${counts ? '  <- counts toward hasStrengthTrack' : ''}`);
  }
  const anyAssessed = (obj: Record<string, any>) =>
    Object.entries(obj).some(([k, v]) => !NON_STRENGTH.has(k) && readLevel(v) > 0);
  const hasStrength = anyAssessed(domains) || anyAssessed(tracks);
  console.log(`(hasStrengthTrack would return: ${hasStrength})`);

  console.log('');
  console.log('── resolveTabLocks result ─────────────────────────────');
  const hasRunning = !!running.isUnlocked;
  console.log(JSON.stringify({
    strength: !hasStrength,
    running: !hasRunning,
    mixed: !hasStrength || !hasRunning,
  }, null, 2));
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
