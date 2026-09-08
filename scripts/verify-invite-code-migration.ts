/**
 * scripts/verify-invite-code-migration.ts — SPEC-01 task 2b step 2 (READ-ONLY)
 *
 * For every community_groups/{id} doc carrying a legacy `inviteCode` field,
 * confirms {id}/private/invite exists with the SAME code value — the
 * precondition David set before step 3 (stop dual-writing the legacy field)
 * and step 4 (delete it from every doc) may run.
 *
 * Reports, and prints full lists so mismatches/missing docs can be
 * inspected individually:
 *   - total community_groups docs scanned
 *   - how many carry a legacy inviteCode field at all
 *   - matches       — private/invite exists, code equal      → safe
 *   - mismatches    — private/invite exists, DIFFERENT code  → investigate, do NOT delete
 *   - missing       — private/invite doc doesn't exist       → investigate, do NOT delete
 *
 * ZERO writes.
 *
 * Usage:
 *   Against the emulator (test the script itself before touching real data):
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/verify-invite-code-migration.ts
 *   Against production (uses FIREBASE_SERVICE_ACCOUNT_KEY from .env.local):
 *     npx tsx scripts/verify-invite-code-migration.ts
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

interface Discrepancy {
  id: string;
  legacy: string;
  newCode: string | null;
}

async function main() {
  const db = initFb();
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  console.log(`Target: ${usingEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION'}\n`);

  const snap = await db.collection('community_groups').get();

  let withLegacyField = 0;
  let matches = 0;
  const mismatches: Discrepancy[] = [];
  const missing: Discrepancy[] = [];

  for (const doc of snap.docs) {
    const legacy = doc.data().inviteCode;
    if (legacy === undefined || legacy === null || legacy === '') continue; // nothing to migrate for this group
    withLegacyField++;

    const inviteDoc = await db.doc(`community_groups/${doc.id}/private/invite`).get();
    if (!inviteDoc.exists) {
      missing.push({ id: doc.id, legacy, newCode: null });
      continue;
    }
    const newCode = (inviteDoc.data()?.code as string | undefined) ?? null;
    if (newCode === legacy) {
      matches++;
    } else {
      mismatches.push({ id: doc.id, legacy, newCode });
    }
  }

  console.log(`Total community_groups docs scanned: ${snap.size}`);
  console.log(`Docs with a legacy inviteCode field:  ${withLegacyField}`);
  console.log(`  Matches (private/invite == legacy):  ${matches}`);
  console.log(`  Mismatches (private/invite DIFFERS):  ${mismatches.length}`);
  console.log(`  Missing (no private/invite doc):      ${missing.length}`);

  if (mismatches.length) {
    console.log('\nMismatches (private/invite exists but disagrees with the legacy field):');
    mismatches.forEach((m) => console.log(`  ${m.id}: legacy="${m.legacy}" new="${m.newCode}"`));
  }
  if (missing.length) {
    console.log('\nMissing private/invite doc entirely:');
    missing.forEach((m) => console.log(`  ${m.id}: legacy="${m.legacy}"`));
  }

  const safe = mismatches.length === 0 && missing.length === 0;
  console.log(`\n${safe ? '✅ SAFE — every legacy code has a matching private/invite doc.' : '❌ NOT SAFE — do not proceed to step 3/4 until the above are resolved.'}`);
  process.exit(safe ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
