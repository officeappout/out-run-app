#!/usr/bin/env npx tsx
/**
 * scripts/fix-lev-hair-name.ts
 *
 * Hygiene fix (Tel Aviv-Yafo neighborhood reconcile) — the existing "לב העיר"
 * neighborhood doc under Tel Aviv-Yafo is the same real place as the official
 * municipal neighborhood name "לב תל אביב" (David-confirmed — not a duplicate,
 * a naming variant). Renaming rather than creating a second entry.
 *
 * Verified via codebase search that nothing keys off the literal string
 * "לב העיר" — all lookups route through the doc's stable `id`
 * (picker id `ta-lev-hair`, unchanged) or generic name-matching logic. This
 * is a display-field-only fix, doc id unchanged. Same pattern as the
 * רמת נגב → רמת הנגב spelling fix (fix-ramat-hanegev-spelling.ts).
 *
 * Updates only the `name` field on the single neighborhood doc
 * (rce8CzPEbk2PIufekJMQ) — no other fields touched.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-lev-hair-name.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-lev-hair-name.ts
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
const DOC_ID = 'rce8CzPEbk2PIufekJMQ';
const OLD_NAME = 'לב העיר';
const NEW_NAME = 'לב תל אביב';

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
