/**
 * ONE-OFF. Confirms whether base_movement_id: null actually persists as raw
 * `null` in Firestore (bypassing normalizeExercise's read-side
 * 'unspecified_movement' display default, exercise-mapping.utils.ts:884-886
 * — a pre-existing, intentional fallback, not part of Round 2's scope).
 * Creates+clears+reads-raw+deletes one throwaway doc via Admin SDK directly.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

async function main() {
  const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const customToken = await admin.auth().createCustomToken('round2_raw_check', { email: 'office@appout.co.il' });
  const { signInWithCustomToken } = await import('firebase/auth');
  const { auth } = await import('../src/lib/firebase');
  await signInWithCustomToken(auth, customToken);

  const { createExercise, updateExercise, deleteExercise } =
    await import('../src/features/content/exercises/core/exercise.service');

  const exerciseId = await createExercise({
    name: { he: '__ROUND2_RAW_TEST__', en: '__ROUND2_RAW_TEST__', es: '__ROUND2_RAW_TEST__' },
    type: 'reps', loggingMode: 'reps', equipment: [], muscleGroups: [],
    base_movement_id: 'test_before',
    programIds: [], media: {}, content: {}, stats: {},
  } as any);

  await updateExercise(exerciseId, { base_movement_id: null });

  const db = admin.firestore();
  const raw = await db.collection('exercises').doc(exerciseId).get();
  console.log('RAW Firestore base_movement_id:', JSON.stringify(raw.data()?.base_movement_id));
  console.log('typeof:', typeof raw.data()?.base_movement_id);

  await deleteExercise(exerciseId);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
