/**
 * scripts/delete-legacy-invite-code-field.ts — SPEC-02 Wave 0.2 (one-time)
 *
 * Removes the legacy `inviteCode` field from every community_groups/{id}
 * doc that has it. This is the step that actually closes the leak — until
 * this runs, the plain field is still sitting there, still readable by
 * any signed-in guest (community_groups still allows
 * `read: if isAuthenticated()`), regardless of the new private/invite doc
 * existing alongside it.
 *
 * MUST be run only after verify-invite-code-migration.ts reports SAFE
 * (every legacy code has a matching private/invite doc) — this script
 * does NOT re-check that itself; it trusts the caller ran verification
 * first, per SPEC-02's explicit ordering (0.1 stop dual-write, 0.2 delete,
 * run verify before this).
 *
 * Usage:
 *   Against the emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/delete-legacy-invite-code-field.ts
 *   Against production:   npx tsx scripts/delete-legacy-invite-code-field.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  if (admin.apps.length) return admin.firestore();
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'appout-1' });
  } else {
    const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

async function main() {
  const db = initFb();
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  console.log(`Target: ${usingEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION'}\n`);

  const snap = await db.collection('community_groups').get();

  const toClean = snap.docs.filter((d) => {
    const v = d.data().inviteCode;
    return v !== undefined;
  });

  console.log(`Total community_groups docs scanned: ${snap.size}`);
  console.log(`Docs with an inviteCode field to remove: ${toClean.length}`);

  if (toClean.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  const batch = db.batch();
  for (const doc of toClean) {
    batch.update(doc.ref, { inviteCode: admin.firestore.FieldValue.delete() });
  }
  await batch.commit();

  console.log(`Removed inviteCode from ${toClean.length} doc(s).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
