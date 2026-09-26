/**
 * READ-ONLY, PRODUCTION. No writes.
 *
 * Urgent side-finding while investigating Slice F's efficient roster-
 * workout-summary design: real workouts/{docId} docs appear to use `date`
 * (serverTimestamp, set by storage.service.ts's addDoc call), not
 * `completedAt` — the field GET /api/units/member-workouts's
 * computeMemberWorkouts (Task 4 Stage 4) actually queries/orders by. If
 * true across the whole collection, that endpoint's orderBy('completedAt')
 * would exclude every real workout doc from its results (Firestore's
 * orderBy requires the ordered field to be present), independent of
 * anything built in Slices D/E/F. This script measures the real
 * distribution before concluding anything.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const totalSnap = await db.collection('workouts').count().get();
  console.log('workouts total docs:', totalSnap.data().count);

  const hasCompletedAtSnap = await db.collection('workouts').where('completedAt', '!=', null).count().get();
  console.log('docs where completedAt is a real (non-null) value:', hasCompletedAtSnap.data().count);

  // Sample broadly (not just the first 3) to check the `date` vs
  // `completedAt` split, and whether any doc has BOTH.
  const sampleSnap = await db.collection('workouts').limit(500).get();
  let hasDate = 0, hasCompletedAt = 0, hasBoth = 0, hasNeither = 0;
  const neitherExamples: string[] = [];
  sampleSnap.docs.forEach((d) => {
    const data = d.data();
    const dateOk = 'date' in data && data.date != null;
    const completedAtOk = 'completedAt' in data && data.completedAt != null;
    if (dateOk) hasDate++;
    if (completedAtOk) hasCompletedAt++;
    if (dateOk && completedAtOk) hasBoth++;
    if (!dateOk && !completedAtOk) {
      hasNeither++;
      if (neitherExamples.length < 5) neitherExamples.push(d.id);
    }
  });
  console.log(`\nsample of ${sampleSnap.size} docs:`);
  console.log('  has `date`:', hasDate);
  console.log('  has `completedAt`:', hasCompletedAt);
  console.log('  has BOTH:', hasBoth);
  console.log('  has NEITHER:', hasNeither, neitherExamples.length ? `(examples: ${neitherExamples.join(', ')})` : '');
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
