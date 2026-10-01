/**
 * WRITE script — Phase 4c-2 Item 2, muscle_up "Model A".
 * Deliberately a SEPARATE script from the Item 1/Item 3 scripts, so each
 * Firestore write stays independently reviewable/revertible.
 *
 * Flips programs/fTLWzjP9gH2VNpamyCZF (מאסל אפ / עליית כוח) from
 * isMaster:true to isMaster:false — it's a SKILL with 14 exercises tagged
 * directly to it, not a master composed of real children; it was only
 * ever isMaster:true by mistake (the console's "recalculating as a master
 * from 2 children" symptom that kicked this item off).
 *
 * This write must land TOGETHER with the code changes committed alongside
 * this script — isMaster:false alone does not make the Skill-Tree UI
 * treat muscle_up as a leaf program; see src/lib/progression-map-config.ts's
 * header comment and src/features/progression-map/services/
 * prerequisite-derivation.service.ts's MANUAL_PREREQUISITE_OVERRIDES for
 * the two code-side changes that complete this flip (both already
 * committed, inert until this field actually flips in production).
 *
 * Read-before-write and idempotent: verifies the doc's current isMaster is
 * still exactly `true` immediately before writing, and skips + warns
 * instead of overwriting if something already changed it since this
 * script was reviewed.
 *
 * Run: npx tsx --env-file=.env.local scripts/_fix-muscle-up-ismaster-flip.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const MUSCLE_UP_ID = 'fTLWzjP9gH2VNpamyCZF';

async function main() {
  console.log(`About to flip programs/${MUSCLE_UP_ID}.isMaster: true → false`);

  const ref = db.collection('programs').doc(MUSCLE_UP_ID);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  ✗ ${MUSCLE_UP_ID} — DOES NOT EXIST, aborted`); return; }

  const d = snap.data()!;
  if (d.isMaster !== true) {
    console.log(`  ✗ ${MUSCLE_UP_ID} — isMaster is already ${d.isMaster} (not true), skipped — re-check before re-running`);
    return;
  }

  await ref.update({ isMaster: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`  ✓ ${MUSCLE_UP_ID} — isMaster flipped to false`);
  console.log('  Reminder: this is only half the fix — confirm the Phase 4c-2 Item 2 code changes (progression-map-config.ts + prerequisite-derivation.service.ts) are already deployed before relying on this flip.');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
