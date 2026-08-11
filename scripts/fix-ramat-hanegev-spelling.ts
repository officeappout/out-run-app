#!/usr/bin/env npx tsx
/**
 * scripts/fix-ramat-hanegev-spelling.ts
 *
 * Hygiene fix (location-coverage-reconciliation report) — the Ramat HaNegev
 * regional council's Firestore `name` field is missing the letter ה
 * ("רמת נגב" instead of "רמת הנגב"). Confirmed against both Wikipedia and
 * the council's own site (rng.org.il), which agree on "רמת הנגב".
 *
 * Verified via `grep -rn` across src/ and scripts/ that no code hardcodes
 * either spelling — this is a display-field-only fix, doc id unchanged.
 *
 * Updates only the `name` field on the single regional_council doc
 * (itl5LciDnITLg5U1oSLA) — no other fields touched.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-ramat-hanegev-spelling.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-ramat-hanegev-spelling.ts
 */

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const DOC_ID = 'itl5LciDnITLg5U1oSLA';
const OLD_NAME = 'רמת נגב';
const NEW_NAME = 'רמת הנגב';

async function main() {
  const ref = db.collection('authorities').doc(DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`❌  Doc ${DOC_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  if (data.name !== OLD_NAME) {
    console.log(`⏭  Doc ${DOC_ID} name is already "${data.name}" (expected "${OLD_NAME}") — nothing to do`);
    return;
  }

  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Fixing ${DOC_ID}: "${OLD_NAME}" → "${NEW_NAME}" ──`);
  if (DRY_RUN) {
    console.log('  WOULD UPDATE name field only');
  } else {
    await ref.update({ name: NEW_NAME, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('  ✓  UPDATED');
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
