/**
 * WRITE script — runs only after explicit approval from David, on an
 * explicit ID allowlist (not a re-derived filter) so it can never sweep in
 * a doc he asked to hold back.
 *
 * David approved exactly these 7 of the original 9 candidates (23.09.2026);
 * ahTKeHLdPtrbgqi3tbyM and lyK5Qw10Br3viUsROTZS are deliberately excluded
 * pending separate review (one has no createdAt/status at all, the other
 * is literally named "בדיקה תלאביב דוד" — a test record, not a real park).
 *
 * Sets { published: true, contentStatus: 'published' } via .update() —
 * merge, touches only these 2 fields. Verifies each doc still matches the
 * expected signature (published===undefined && contentStatus===undefined)
 * immediately before writing, and skips + warns instead of overwriting if
 * something already changed it since the plan was shown.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const APPROVED_IDS = [
  '2t5az38z4tbMFJOSVBpp',
  'rFxXF6Kf4AG260S3GX8F',
  'R8jeVvPkLybCQUltPJN6',
  '250ImS07Mp2XN8ZzapNb',
  '8tR3mAev3vKhBJlA1NuN',
  'AgmHEDDXiHoAx6YUMaqX',
  'HTaybrnb5q7O7KgNBzb2',
];

async function main() {
  console.log(`About to backfill ${APPROVED_IDS.length} approved doc(s): ${APPROVED_IDS.join(', ')}`);

  for (const id of APPROVED_IDS) {
    const ref = db.collection('parks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${id} — DOES NOT EXIST, skipped`); continue; }
    const d = snap.data()!;
    if (d.published !== undefined || d.contentStatus !== undefined) {
      console.log(`  ✗ ${id} — signature changed since plan was shown (published=${d.published}, contentStatus=${d.contentStatus}), skipped`);
      continue;
    }
    await ref.update({ published: true, contentStatus: 'published' });
    console.log(`  ✓ ${id}`);
  }

  console.log('Done.');
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
