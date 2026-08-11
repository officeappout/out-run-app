#!/usr/bin/env npx tsx
/**
 * scripts/fix-vardon-parent-council.ts
 *
 * Correction — ורדון was shipped under לכיש in Phase B round 2/3, but
 * verification (council's own site yoav.org.il, plus multiple government
 * planning documents) confirms it is officially a יואב member, not לכיש.
 * Same category of fix as the earlier מגידו/מעלה עירון boundary-leakage
 * correction: update parentAuthorityId in place, don't delete+recreate.
 *
 * Updates only parentAuthorityId (+ updatedAt) on the single existing
 * settlement doc — name, coordinates, and doc id unchanged.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-vardon-parent-council.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/fix-vardon-parent-council.ts
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
const DOC_ID = 'LwgQMyJzCAeWvuWrnE2C';
const OLD_PARENT = 'SyzwqMrFbQc6tftxSL5T'; // לכיש
const NEW_PARENT = '2lbGe71GBJfYo2wWbMsj'; // יואב

async function main() {
  const ref = db.collection('authorities').doc(DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`❌  Doc ${DOC_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  if (data.name !== 'ורדון') {
    console.error(`❌  Doc ${DOC_ID} name is "${data.name}", expected "ורדון" — aborting`);
    process.exit(1);
  }
  if (data.parentAuthorityId !== OLD_PARENT) {
    console.log(`⏭  Doc ${DOC_ID} parentAuthorityId is already "${data.parentAuthorityId}" (expected "${OLD_PARENT}") — nothing to do`);
    return;
  }

  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Fixing ${DOC_ID} (ורדון): parentAuthorityId ${OLD_PARENT} (לכיש) → ${NEW_PARENT} (יואב) ──`);
  if (DRY_RUN) {
    console.log('  WOULD UPDATE parentAuthorityId only');
  } else {
    await ref.update({ parentAuthorityId: NEW_PARENT, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('  ✓  UPDATED');
  }
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
