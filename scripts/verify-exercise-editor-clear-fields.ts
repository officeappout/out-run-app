/**
 * REGRESSION SCRIPT — kept in git, not a one-off (docs/workout-engine/
 * 03-CHANGES.md, 08-09.09.2026: "admin panel can't clear a field" bug).
 *
 * THE PATTERN: in the exercise editor, clearing a field must send `null`,
 * never `undefined`. `undefined` means "the user didn't touch this field"
 * to the save pipeline — sending it to mean "cleared" silently keeps the
 * OLD stored value instead:
 *   - Fields covered by exercise.service.ts's `preserveField`
 *     (exercise.service.ts:352-364, the full list is right there) —
 *     `undefined` explicitly falls through to "preserve existing value".
 *   - Fields NOT covered by preserveField (e.g. targetPrograms) — `undefined`
 *     just drops the key from the updateDoc payload, so Firestore's partial
 *     update never touches the field. Same silent-preserve outcome,
 *     different mechanism.
 * For array fields the equivalent "cleared" value is a real `[]`, not
 * `null` — matches how every other array field in this codebase is already
 * handled (sanitizeExerciseData, exercise-mapping.utils.ts).
 *
 * FOUR instances of this were found and fixed in one pass: movementGroup /
 * primaryMuscle / base_movement_id (single-value → null) and targetPrograms
 * (array → []). The trigger shape was always the same: a "click again to
 * deselect" chip/toggle, a dropdown's blank option, or an explicit "clear"
 * button — `field: selected ? undefined : value` or `field || undefined`.
 *
 * WHEN ADDING A NEW FIELD/CONTROL TO THE EXERCISE EDITOR: grep for that
 * exact shape (`? undefined :`, `|| undefined`, `?? undefined`) in whatever
 * sets the field. If the control has a "clear"/"deselect" affordance, its
 * clear branch must produce `null` (single value) or `[]` (array) — never
 * `undefined`. Then add a case to this script covering it and re-run.
 *
 * Exercises the REAL production save path — client-SDK
 * createExercise/updateExercise/getExercise from exercise.service.ts, not a
 * raw Admin-SDK write — against ONE throwaway test exercise doc, created and
 * deleted by this script. Run: `npx tsx scripts/verify-exercise-editor-clear-fields.ts`
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
  const customToken = await admin.auth().createCustomToken('exercise_editor_clear_fields_verify', {
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
    name: { he: '__EDITOR_CLEAR_FIELDS_TEST__ תרגיל בדיקה', en: '__EDITOR_CLEAR_FIELDS_TEST__', es: '__EDITOR_CLEAR_FIELDS_TEST__' },
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
    // sanitizeExerciseData were never touched by the fix — they already
    // handled null correctly; only the UI's produced value changed.
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
    // this fix. So the real proof point is the RAW Firestore value, not
    // what getExercise() returns.
    await updateExercise(exerciseId, { base_movement_id: null });
    const rawDoc = await admin.firestore().collection('exercises').doc(exerciseId).get();
    ex = await getExercise(exerciseId);
    console.log('\n[Test 3 — base_movement_id: null]');
    check('raw Firestore value is null (the real write-path proof)', rawDoc.data()?.base_movement_id === null, JSON.stringify(rawDoc.data()?.base_movement_id));
    check('getExercise() shows the pre-existing unspecified_movement default (expected, unrelated to this fix)', ex?.base_movement_id === 'unspecified_movement', String(ex?.base_movement_id));

    // ── Test 4: clear targetPrograms ([]) → saved empty ─────────────────────
    // Not covered by preserveField — ExerciseEditorForm.tsx used to send
    // `targetPrograms.length > 0 ? targetPrograms : undefined`, which drops
    // the key from the updateDoc payload entirely on clear (Firestore's
    // partial update then never touches the field, silently preserving the
    // old assignments). Fixed to always send the real array. Re-set a real
    // value first (Test 3's updates left targetPrograms untouched at its
    // original [{core, level:1}], but be explicit rather than rely on that).
    await updateExercise(exerciseId, { targetPrograms: [{ programId: 'core', level: 1 }] });
    // Reproduce the OLD ExerciseEditorForm.tsx ternary's output directly
    // against the (unmodified) service layer — the same undefined-drops-the-
    // key mechanism Test 0 demonstrated for movementGroup.
    await updateExercise(exerciseId, { targetPrograms: undefined });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 4a — targetPrograms: undefined (reproduces the pre-fix ternary output)]');
    check('BUG REPRODUCED: undefined silently preserves the old targetPrograms', (ex?.targetPrograms?.length ?? 0) === 1, JSON.stringify(ex?.targetPrograms));

    await updateExercise(exerciseId, { targetPrograms: [] });
    ex = await getExercise(exerciseId);
    console.log('\n[Test 4b — targetPrograms: [] (the fix)]');
    check('targetPrograms cleared to empty', (ex?.targetPrograms?.length ?? 0) === 0, JSON.stringify(ex?.targetPrograms));

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
