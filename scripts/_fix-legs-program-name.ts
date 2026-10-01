/**
 * WRITE script — Phase 4c-2 Item 1, the Firestore half of the "legs" rename.
 *
 * The code-level fix (src/lib/progression-map-config.ts's nameHe, committed
 * separately) does NOT change what the Skill-Tree page actually shows —
 * SkillTreeScreen.tsx reads `programMeta?.name` straight from this Program
 * doc, bypassing that constant entirely. This script is the other half:
 * it updates the live `.name` field itself.
 *
 * Read-before-write: verifies the doc's current name is still exactly
 * "פלג גוף תחתון" immediately before writing, and skips + warns instead of
 * overwriting if something already changed it since this script was
 * reviewed. Touches exactly one field on one doc.
 *
 * Run: npx tsx --env-file=.env.local scripts/_fix-legs-program-name.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const LEGS_ID = 'OrAmOH3F375dVio5yGdU';
const EXPECTED_CURRENT_NAME = 'פלג גוף תחתון';
const NEW_NAME = 'רגליים';

async function main() {
  console.log(`About to rename programs/${LEGS_ID}.name: "${EXPECTED_CURRENT_NAME}" → "${NEW_NAME}"`);

  const ref = db.collection('programs').doc(LEGS_ID);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  ✗ ${LEGS_ID} — DOES NOT EXIST, aborted`); return; }

  const d = snap.data()!;
  if (d.name !== EXPECTED_CURRENT_NAME) {
    console.log(`  ✗ ${LEGS_ID} — name is already "${d.name}" (not the expected "${EXPECTED_CURRENT_NAME}"), skipped — re-check before re-running`);
    return;
  }

  await ref.update({ name: NEW_NAME, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`  ✓ ${LEGS_ID} — name updated to "${NEW_NAME}"`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
