/**
 * scripts/backfill-invite-code-private-doc.ts — SPEC-02 Wave 0 (one-time)
 *
 * Gap found empirically while running verify-invite-code-migration.ts
 * against real data, not anticipated by either SPEC-01 or SPEC-02: the
 * task-2 writer fix (atomic dual-write) only applies to groups created
 * AFTER it ships. It does nothing for groups that already existed —
 * and since nothing has been deployed yet, that's currently every real
 * group in production (19/19 legacy-field groups had no private/invite
 * doc at all).
 *
 * For every community_groups/{id} with a non-empty legacy `inviteCode`
 * and no existing private/invite doc, creates one with the same value.
 * Idempotent — skips any group that already has the doc (safe to re-run).
 *
 * Usage:
 *   Against the emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/backfill-invite-code-private-doc.ts
 *   Against production:   npx tsx scripts/backfill-invite-code-private-doc.ts
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

  let candidates = 0;
  let created = 0;
  let alreadyHadIt = 0;

  for (const doc of snap.docs) {
    const legacy = doc.data().inviteCode;
    if (legacy === undefined || legacy === null || legacy === '') continue;
    candidates++;

    const inviteRef = db.doc(`community_groups/${doc.id}/private/invite`);
    const inviteDoc = await inviteRef.get();
    if (inviteDoc.exists) {
      alreadyHadIt++;
      continue;
    }
    await inviteRef.set({ code: legacy });
    created++;
    console.log(`  created ${doc.id}/private/invite = { code: "${legacy}" }`);
  }

  console.log(`\nGroups with a legacy inviteCode field: ${candidates}`);
  console.log(`  Already had private/invite: ${alreadyHadIt}`);
  console.log(`  Backfilled just now:        ${created}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
