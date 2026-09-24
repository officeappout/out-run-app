/**
 * INVESTIGATION (22.09.2026, coverflow-redesign scoping) — read-only.
 * Per category/program: how many showInOnboarding===true levels exist
 * (= how many slider stops / coverflow tiles the redesign must handle)?
 * Run: npx tsx scripts/_investigate-slider-position-counts.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('visual_assessment_content').where('showInOnboarding', '==', true).get();
  const byCategory: Record<string, number[]> = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d.level);
  }
  for (const cat of Object.keys(byCategory)) byCategory[cat].sort((a, b) => a - b);

  // Resolve category hash IDs -> readable program slugs/names for the report.
  const programsSnap = await db.collection('programs').get();
  const idToName: Record<string, string> = {};
  for (const p of programsSnap.docs) {
    const d = p.data();
    idToName[p.id] = `${d.slug || d.movementPattern || p.id} (${d.name?.he || ''})`;
  }

  const report = Object.fromEntries(
    Object.entries(byCategory).map(([catId, levels]) => [
      idToName[catId] || catId,
      { count: levels.length, levels },
    ]),
  );
  console.log(JSON.stringify(report, null, 2));
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
