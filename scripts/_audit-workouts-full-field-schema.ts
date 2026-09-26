/**
 * READ-ONLY, PRODUCTION. No writes.
 *
 * Extends _audit-workouts-field-schema.ts's finding (completedAt: 0/734
 * real docs) to every field GET /api/units/member-workouts's
 * computeMemberWorkouts actually reads: workoutTitle, type, completedAt,
 * durationMinutes. Measures real prevalence of each, plus the fields real
 * docs actually use instead (date, duration, workoutType/activityType/
 * category), to report the full, precise scope of the mismatch.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const EXPECTED_FIELDS = ['workoutTitle', 'type', 'completedAt', 'durationMinutes'];
const REAL_CANDIDATE_FIELDS = ['date', 'duration', 'workoutType', 'activityType', 'category', 'activityCategory'];

async function main() {
  const sampleSnap = await db.collection('workouts').limit(734).get();
  console.log('sample size:', sampleSnap.size);

  const counts: Record<string, number> = {};
  [...EXPECTED_FIELDS, ...REAL_CANDIDATE_FIELDS].forEach((f) => { counts[f] = 0; });

  sampleSnap.docs.forEach((d) => {
    const data = d.data();
    [...EXPECTED_FIELDS, ...REAL_CANDIDATE_FIELDS].forEach((f) => {
      if (f in data && data[f] != null) counts[f]++;
    });
  });

  console.log('\n=== Fields computeMemberWorkouts actually reads/selects (expected) ===');
  EXPECTED_FIELDS.forEach((f) => console.log(`  ${f}: ${counts[f]} / ${sampleSnap.size}`));

  console.log('\n=== Fields real docs actually carry instead ===');
  REAL_CANDIDATE_FIELDS.forEach((f) => console.log(`  ${f}: ${counts[f]} / ${sampleSnap.size}`));
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
