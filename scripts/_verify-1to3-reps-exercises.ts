/**
 * David's item 3 (22.09.2026, field-test doc 29): find "כפיפות בטן",
 * "עליות תאומים", and any "שכיבות סמיכה" (push-up) variants by name, check
 * symmetry/skill tagging. READ-ONLY. No writes.
 * Run: npx tsx scripts/_verify-1to3-reps-exercises.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

function nameOf(data: any): string {
  const n = data.name;
  if (typeof n === 'string') return n;
  return n?.he ?? n?.en ?? '(no name)';
}

async function main() {
  const db = initFb();
  const snap = await db.collection('exercises').get();
  console.log(`Total exercises in bank: ${snap.size}`);

  const searchTerms = ['כפיפות בטן', 'עליות תאומים', 'שכיבות סמיכה'];
  for (const term of searchTerms) {
    const matches = snap.docs.filter((d) => nameOf(d.data()).includes(term));
    console.log(`\n=== Matches for "${term}" (${matches.length}) ===`);
    for (const d of matches) {
      const data = d.data();
      console.log(`\n  id: ${d.id}`);
      console.log(`  name: ${JSON.stringify(data.name)}`);
      console.log(`  symmetry: ${JSON.stringify(data.symmetry)}`);
      console.log(`  movementGroup: ${JSON.stringify(data.movementGroup)}`);
      console.log(`  domain: ${JSON.stringify(data.domain ?? data.muscleGroups)}`);
      const methods = data.execution_methods || data.executionMethods || [];
      console.log(`  execution_methods (${methods.length}):`);
      for (const m of methods) {
        console.log(`    - location=${m.location}, methodName=${JSON.stringify(m.methodName)}, hasMedia=${!!(m.media?.mainVideoUrl || m.media?.imageUrl || m.media?.previewVideo)}`);
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
