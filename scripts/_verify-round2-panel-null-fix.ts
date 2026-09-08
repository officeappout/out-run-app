/**
 * ONE-OFF, real Firestore round-trip verification for Round 2 (the panel
 * undefined-vs-null bug, docs/workout-engine/03-CHANGES.md). Exercises the
 * REAL production save path — client-SDK createExercise/updateExercise/
 * getExercise from exercise.service.ts, not a raw Admin-SDK write — against
 * ONE throwaway test exercise doc, created and deleted by this script.
 *
 * Signs in via a minted custom token carrying office@appout.co.il's email
 * claim (isRootAdmin() in firestore.rules), same headless-client pattern as
 * scripts/audit/build-snapshot.ts's authenticateHeadlessClient — except this
 * script DOES write (the round-trip under test), scoped to one doc it owns.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

async function authenticateHeadlessAdminClient() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
  const cred = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const customToken = await admin.auth().createCustomToken('round2_verify_script', {
    email: 'office@appout.co.il',
  });
  const { signInWithCustomToken } = await import('firebase/auth');
  const { auth } = await import('../src/lib/firebase');
  await signInWithCustomToken(auth, customToken);
}

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  await authenticateHeadlessAdminClient();
  const { createExercise, updateExercise, getExercise, deleteExercise } =
    await import('../src/features/content/exercises/core/exercise.service');

  console.log('Creating test exercise...');
  const exerciseId = await createExercise({
    name: { he: '__ROUND2_TEST__ תרגיל בדיקה', en: '__ROUND2_TEST__', es: '__ROUND2_TEST__' },
    type: 'reps',
    loggingMode: 'reps',
    equipment: [],
    muscleGroups: [],
    primaryMuscle: 'quads',
    movementGroup: 'squat',
    base_movement_id: 'test_squat_variation',
    targetPrograms: [{ programId: 'core', level: 1 }],
    tags: ['skill'],
    programIds: [],
    media: {},
    content: {},
    stats: {},
  } as any);
  console.log(`Created: ${exerciseId}`);

  try {
    // ── Baseline: confirm initial values persisted ─────────────────────────
    let ex = await getExercise(exerciseId);
    console.log('\n[Baseline]');
    check('primaryMuscle initially quads', ex?.primaryMuscle === 'quads', String(ex?.primaryMuscle));
    check('movementGroup initially squat', ex?.movementGroup === 'squat', String(ex?.movementGroup));
    check('base_movement_id initially set', ex?.base_movement_id === 'test_squat_variation', String(ex?.base_movement_id));
    check('targetPrograms initially 1 entry', (ex?.targetPrograms?.length ?? 0) === 1, JSON.stringify(ex?.targetPrograms));
    check('tags initially [skill]', JSON.stringify(ex?.tags) === JSON.stringify(['skill']), JSON.stringify(ex?.tags));

    // ── Test 0: prove the bug is real — undefined (the OLD, unfixed UI
    // value) against the UNMODIFIED service layer must silently NOT clear.
    // This isolates the exact causal mechanism (undefined vs null) rather
    // than relying on a git-stash diff, since exercise.service.ts/
    // sanitizeExerciseData were never touched by this round's fix — they
    // already handled null correctly; only the UI's produced value changed.
    await updateExercise(exerciseId, { movementGroup: undefined });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 0 — movementGroup: undefined (reproduces the pre-fix bug)]');
    check('BUG REPRODUCED: undefined silently preserves the old value (squat), proving the bug is real', ex?.movementGroup === 'squat', String(ex?.movementGroup));

    // ── Test 1: deselect movementGroup (null) → saved empty ────────────────
    await updateExercise(exerciseId, { movementGroup: null });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 1 — movementGroup: null]');
    check('movementGroup cleared (null/undefined)', ex?.movementGroup == null, String(ex?.movementGroup));

    // ── Test 2: clear primaryMuscle (null) → saved empty ────────────────────
    await updateExercise(exerciseId, { primaryMuscle: null });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 2 — primaryMuscle: null]');
    check('primaryMuscle cleared (null/undefined)', ex?.primaryMuscle == null, String(ex?.primaryMuscle));

    // ── Test 3: clear base_movement_id (null) → saved empty ─────────────────
    // getExercise() runs through normalizeExercise, which has its OWN
    // pre-existing, intentional read-side default (exercise-mapping.utils.ts
    // :884-886, comment: "Testing bypass: allow Level 6/7 exercises; Smart
    // Swap broken for these") — a falsy base_movement_id normalizes to the
    // literal string 'unspecified_movement' on every read, unrelated to
    // Round 2. So the real proof point is the RAW Firestore value, not what
    // getExercise() returns.
    await updateExercise(exerciseId, { base_movement_id: null });
    const rawDoc = await admin.firestore().collection('exercises').doc(exerciseId).get();
    ex = await getExercise(exerciseId);
    console.log('\n[Test 3 — base_movement_id: null]');
    check('raw Firestore value is null (the real write-path proof)', rawDoc.data()?.base_movement_id === null, JSON.stringify(rawDoc.data()?.base_movement_id));
    check('getExercise() shows the pre-existing unspecified_movement default (expected, unrelated to Round 2)', ex?.base_movement_id === 'unspecified_movement', String(ex?.base_movement_id));

    // ── Test 5: value switch still works (chip-to-chip) ─────────────────────
    await updateExercise(exerciseId, { movementGroup: 'hinge', primaryMuscle: 'hamstrings' });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 5 — value switch]');
    check('movementGroup switched to hinge', ex?.movementGroup === 'hinge', String(ex?.movementGroup));
    check('primaryMuscle switched to hamstrings', ex?.primaryMuscle === 'hamstrings', String(ex?.primaryMuscle));

    // ── Test 6: untouched field survives an unrelated update ────────────────
    // tags was never re-sent in tests 1-5 above — if preserveField's
    // protection still works, it must still read ['skill'] right now.
    console.log('\n[Test 6 — untouched field (tags) preserved across 5 prior updates]');
    check('tags still [skill] (preserveField intact)', JSON.stringify(ex?.tags) === JSON.stringify(['skill']), JSON.stringify(ex?.tags));

    // Explicit final check: an update that omits movementGroup entirely
    // (real "untouched" case) must NOT clear the value we just set in Test 5.
    await updateExercise(exerciseId, { base_movement_id: 'unrelated_touch_only' });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 7 — omitted key (real untouched) does not clear movementGroup]');
    check('movementGroup still hinge after unrelated update', ex?.movementGroup === 'hinge', String(ex?.movementGroup));
    check('primaryMuscle still hamstrings after unrelated update', ex?.primaryMuscle === 'hamstrings', String(ex?.primaryMuscle));

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} checks passed`);
  } finally {
    console.log(`\nDeleting test exercise ${exerciseId}...`);
    await deleteExercise(exerciseId);
    console.log('Deleted.');
  }

  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
