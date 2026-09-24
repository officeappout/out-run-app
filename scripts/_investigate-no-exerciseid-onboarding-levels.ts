/**
 * INVESTIGATION (22.09.2026, coverflow build) — read-only.
 * Lists the showInOnboarding===true visual_assessment_content docs that have
 * no exerciseId, for David's later admin backfill.
 * Run: npx tsx scripts/_investigate-no-exerciseid-onboarding-levels.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('visual_assessment_content').where('showInOnboarding', '==', true).get();
  const programsSnap = await db.collection('programs').get();
  const idToName: Record<string, string> = {};
  for (const p of programsSnap.docs) {
    const d = p.data();
    idToName[p.id] = d.slug || d.movementPattern || p.id;
  }

  const missing = snap.docs
    .filter(doc => !doc.data().exerciseId)
    .map(doc => ({
      docId: doc.id,
      category: idToName[doc.data().category] || doc.data().category,
      level: doc.data().level,
      boldTitleHe: doc.data().boldTitle?.he?.neutral || null,
    }))
    .sort((a, b) => (a.category === b.category ? a.level - b.level : a.category.localeCompare(b.category)));

  console.log(JSON.stringify({ count: missing.length, missing }, null, 2));
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
