/**
 * computeDemonstratedStrengthLevels — REAL Firestore-emulator
 * integration suite (04.10.2026, §13.88). §31 discipline: every
 * assertion exercises the real Admin SDK read path (Timestamp/Date
 * coercion included) against real `programs`/`exercises`/`workouts`
 * documents, never a fake in-memory shape.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens — same established convention as every
 * other emulator suite in this build. Per the project-wide memory on
 * this: run ONLY this file, never together with another
 * *.emulator.test.ts in the same vitest invocation (they share one
 * emulator database and each wipes it all).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { computeDemonstratedStrengthLevels, STRENGTH_LEVEL_WINDOW_DAYS } from '../readiness-strength-level.service';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';

const PULL_PROGRAM_ID = 'program-pull';
const PUSH_PROGRAM_ID = 'program-push';
const OTHER_PROGRAM_ID = 'program-one-arm-pullup'; // deliberately NOT pull/push — the "pull_up_pro" case

// Test exercise ids
const FULL_PULLUP = 'ex-full-pullup'; // pull, level 11
const THIN_BAND_PULLUP = 'ex-thin-band-pullup'; // pull, level 9
const THICK_BAND_PULLUP = 'ex-thick-band-pullup'; // pull, level 6
const DUAL_PROGRAM_EXERCISE = 'ex-dual-program'; // pull AND push
const DUPLICATE_LEVEL_EXERCISE = 'ex-duplicate-level'; // pull at TWO levels on one doc (9 and 11)
const OTHER_PROGRAM_ONLY_EXERCISE = 'ex-other-program-only'; // only maps to OTHER_PROGRAM_ID
const TIME_BASED_PULL_EXERCISE = 'ex-time-based-pull'; // pull, level 11, type 'time'

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

async function seedProgramsAndExercises(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('programs').doc(PULL_PROGRAM_ID), { slug: 'pull', name: 'משיכה' });
  batch.set(db.collection('programs').doc(PUSH_PROGRAM_ID), { slug: 'push', name: 'דחיפה' });
  batch.set(db.collection('programs').doc(OTHER_PROGRAM_ID), { slug: 'one_arm_pullup', name: 'מתח יד אחת' });

  batch.set(db.collection('exercises').doc(FULL_PULLUP), {
    type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 11 }],
  });
  batch.set(db.collection('exercises').doc(THIN_BAND_PULLUP), {
    type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 9 }],
  });
  batch.set(db.collection('exercises').doc(THICK_BAND_PULLUP), {
    type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 6 }],
  });
  batch.set(db.collection('exercises').doc(DUAL_PROGRAM_EXERCISE), {
    type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 7 }, { programId: PUSH_PROGRAM_ID, level: 8 }],
  });
  batch.set(db.collection('exercises').doc(DUPLICATE_LEVEL_EXERCISE), {
    type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 11 }, { programId: PULL_PROGRAM_ID, level: 9 }],
  });
  batch.set(db.collection('exercises').doc(OTHER_PROGRAM_ONLY_EXERCISE), {
    type: 'reps', targetPrograms: [{ programId: OTHER_PROGRAM_ID, level: 11 }],
  });
  batch.set(db.collection('exercises').doc(TIME_BASED_PULL_EXERCISE), {
    type: 'time', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 11 }],
  });
  await batch.commit();
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** One workout doc with ONE strength segment holding the given exerciseLog entries. */
async function seedStrengthWorkout(id: string, userId: string, date: Date, exerciseLog: { exerciseId: string; confirmedReps: number[] }[]): Promise<void> {
  await db.collection('workouts').doc(id).set({
    userId,
    date: Timestamp.fromDate(date),
    workoutType: 'strength',
    segments: [
      { index: 0, kind: 'strength', actual: { exerciseLog } },
    ],
  });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `strength-level-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  await seedProgramsAndExercises();
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seedProgramsAndExercises();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeDemonstratedStrengthLevels — the per-level minimum-evidence rule (David\'s 05.10.2026 correction)', () => {
  it('1 performance at level 11 + 2 at level 6 → level 6 (the 11 is a single rep, not enough on its own), reps from level 6', async () => {
    await seedStrengthWorkout('w1', 'uid-1', daysAgo(1), [{ exerciseId: FULL_PULLUP, confirmedReps: [1] }]); // level 11, ONE performance only
    await seedStrengthWorkout('w2', 'uid-1', daysAgo(2), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [20] }]);
    await seedStrengthWorkout('w3', 'uid-1', daysAgo(3), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [15] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-1']);
    expect(result['uid-1'].pull).toEqual({ level: 6, reps: 20 });
  });

  it('2 performances at level 11 + 5 at level 6 → level 11 (both qualify, 11 is the higher), reps from level 11', async () => {
    await seedStrengthWorkout('w1', 'uid-2', daysAgo(1), [{ exerciseId: FULL_PULLUP, confirmedReps: [3] }]);
    await seedStrengthWorkout('w2', 'uid-2', daysAgo(2), [{ exerciseId: FULL_PULLUP, confirmedReps: [5] }]);
    await seedStrengthWorkout('w3', 'uid-2', daysAgo(3), [
      { exerciseId: THICK_BAND_PULLUP, confirmedReps: [20] },
    ]);
    await seedStrengthWorkout('w4', 'uid-2', daysAgo(4), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [18] }]);
    await seedStrengthWorkout('w5', 'uid-2', daysAgo(5), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [22] }]);
    await seedStrengthWorkout('w6', 'uid-2', daysAgo(6), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [25] }]);
    await seedStrengthWorkout('w7', 'uid-2', daysAgo(7), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [19] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-2']);
    expect(result['uid-2'].pull).toEqual({ level: 11, reps: 5 }); // the band's 25 reps never counts — wrong level
  });

  it('1 performance at level 11 + 1 at level 6 → null — no single level reached 2', async () => {
    await seedStrengthWorkout('w1', 'uid-3', daysAgo(1), [{ exerciseId: FULL_PULLUP, confirmedReps: [1] }]);
    await seedStrengthWorkout('w2', 'uid-3', daysAgo(2), [{ exerciseId: THICK_BAND_PULLUP, confirmedReps: [20] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-3']);
    expect(result['uid-3'].pull).toEqual({ level: null, reps: null });
  });

  it('a single performance of just one level, no competing level at all → still null', async () => {
    await seedStrengthWorkout('w1', 'uid-3b', daysAgo(1), [{ exerciseId: FULL_PULLUP, confirmedReps: [5] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-3b']);
    expect(result['uid-3b'].pull.level).toBeNull();
  });
});

describe('computeDemonstratedStrengthLevels — other derivation rules', () => {
  it('an exercise present in BOTH programs is counted correctly in each', async () => {
    await seedStrengthWorkout('w1', 'uid-4', daysAgo(1), [{ exerciseId: DUAL_PROGRAM_EXERCISE, confirmedReps: [10] }]);
    await seedStrengthWorkout('w2', 'uid-4', daysAgo(2), [{ exerciseId: DUAL_PROGRAM_EXERCISE, confirmedReps: [8] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-4']);
    expect(result['uid-4'].pull).toEqual({ level: 7, reps: 10 }); // best set across the two performances
    expect(result['uid-4'].push).toEqual({ level: 8, reps: 10 });
  });

  it('an exercise listed at two levels in the SAME program → the LOWER one', async () => {
    await seedStrengthWorkout('w1', 'uid-5', daysAgo(1), [{ exerciseId: DUPLICATE_LEVEL_EXERCISE, confirmedReps: [6] }]);
    await seedStrengthWorkout('w2', 'uid-5', daysAgo(2), [{ exerciseId: DUPLICATE_LEVEL_EXERCISE, confirmedReps: [5] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-5']);
    expect(result['uid-5'].pull.level).toBe(9); // min(11, 9), never 11
  });

  it('an exercise mapped ONLY to a different program (the "pull_up_pro" case) → null, never credited as a pull level', async () => {
    await seedStrengthWorkout('w1', 'uid-6', daysAgo(1), [{ exerciseId: OTHER_PROGRAM_ONLY_EXERCISE, confirmedReps: [5] }]);
    await seedStrengthWorkout('w2', 'uid-6', daysAgo(2), [{ exerciseId: OTHER_PROGRAM_ONLY_EXERCISE, confirmedReps: [5] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-6']);
    expect(result['uid-6'].pull.level).toBeNull();
    expect(result['uid-6'].push.level).toBeNull();
  });

  it('no reps field (a time-held exercise) at the highest demonstrated level → "no count," never 0', async () => {
    await seedStrengthWorkout('w1', 'uid-7', daysAgo(1), [{ exerciseId: TIME_BASED_PULL_EXERCISE, confirmedReps: [45] }]); // 45 SECONDS held, not reps
    await seedStrengthWorkout('w2', 'uid-7', daysAgo(2), [{ exerciseId: TIME_BASED_PULL_EXERCISE, confirmedReps: [50] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-7']);
    expect(result['uid-7'].pull.level).toBe(11); // level still counts
    expect(result['uid-7'].pull.reps).toBeNull(); // but reps does not — never 45/50
  });

  it('zero workouts in the window → null, and null is explicitly NOT 0', async () => {
    const result = await computeDemonstratedStrengthLevels(db, ['uid-8-no-workouts']);
    expect(result['uid-8-no-workouts'].pull.level).toBeNull();
    expect(result['uid-8-no-workouts'].pull.level).not.toBe(0);
    expect(result['uid-8-no-workouts'].push.reps).toBeNull();
    expect(result['uid-8-no-workouts'].push.reps).not.toBe(0);
  });

  it(`a workout on day ${STRENGTH_LEVEL_WINDOW_DAYS + 1} is outside the window`, async () => {
    await seedStrengthWorkout('w1', 'uid-9', daysAgo(STRENGTH_LEVEL_WINDOW_DAYS + 1), [{ exerciseId: FULL_PULLUP, confirmedReps: [5] }]);
    await seedStrengthWorkout('w2', 'uid-9', daysAgo(STRENGTH_LEVEL_WINDOW_DAYS + 1), [{ exerciseId: FULL_PULLUP, confirmedReps: [5] }]);

    const result = await computeDemonstratedStrengthLevels(db, ['uid-9']);
    expect(result['uid-9'].pull.level).toBeNull();
  });

  it('31 uids batch into two chunks and union correctly — every uid gets its own right answer', async () => {
    const uids = Array.from({ length: 31 }, (_, i) => `batch-uid-${i}`);
    // Give exactly the 31st uid (the one alone in the second chunk) real evidence; everyone else stays workout-less.
    const targetUid = uids[30];
    await seedStrengthWorkout('w1', targetUid, daysAgo(1), [{ exerciseId: FULL_PULLUP, confirmedReps: [4] }]);
    await seedStrengthWorkout('w2', targetUid, daysAgo(2), [{ exerciseId: FULL_PULLUP, confirmedReps: [6] }]);

    const result = await computeDemonstratedStrengthLevels(db, uids);
    expect(Object.keys(result).length).toBe(31);
    expect(result[targetUid].pull).toEqual({ level: 11, reps: 6 });
    expect(result[uids[0]].pull.level).toBeNull();
    expect(result[uids[15]].pull.level).toBeNull();
  });

  it('a hybrid workout\'s strength segment at index 1 ("legA/station/legB") is still read correctly', async () => {
    await db.collection('workouts').doc('hybrid-w1').set({
      userId: 'uid-hybrid',
      date: Timestamp.fromDate(daysAgo(1)),
      workoutType: 'hybrid',
      segments: [
        { index: 0, kind: 'aerobic', actual: { durationSec: 600 } },
        { index: 1, kind: 'strength', actual: { exerciseLog: [{ exerciseId: FULL_PULLUP, confirmedReps: [5] }] } },
        { index: 2, kind: 'aerobic', actual: { durationSec: 400 } },
      ],
    });
    await db.collection('workouts').doc('hybrid-w2').set({
      userId: 'uid-hybrid',
      date: Timestamp.fromDate(daysAgo(2)),
      workoutType: 'hybrid',
      segments: [
        { index: 0, kind: 'aerobic', actual: { durationSec: 600 } },
        { index: 1, kind: 'strength', actual: { exerciseLog: [{ exerciseId: FULL_PULLUP, confirmedReps: [7] }] } },
      ],
    });

    const result = await computeDemonstratedStrengthLevels(db, ['uid-hybrid']);
    expect(result['uid-hybrid'].pull).toEqual({ level: 11, reps: 7 });
  });
});

describe('computeDemonstratedStrengthLevels — allowlist resolution failure must throw, never silently return null (David\'s 05.10.2026 correction)', () => {
  it('0 programs matching the "pull"/"push" slugs (e.g. renamed to "pull-ups") → throws, naming the missing slug — never a null-filled result', async () => {
    // Overwrite the standard seed's pull/push programs so NEITHER slug resolves — the exact "renamed slug" scenario David described.
    await db.collection('programs').doc(PULL_PROGRAM_ID).set({ slug: 'pull-ups', name: 'משיכה (שונה)' });
    await db.collection('programs').doc(PUSH_PROGRAM_ID).delete();

    await expect(computeDemonstratedStrengthLevels(db, ['uid-any'])).rejects.toThrow(/no program found with slug "pull"/);
  });

  it('2 programs both claiming the "pull" slug → throws as ambiguous — never silently picks one', async () => {
    await db.collection('programs').doc('program-pull-duplicate').set({ slug: 'pull', name: 'משיכה (כפילות)' });

    await expect(computeDemonstratedStrengthLevels(db, ['uid-any'])).rejects.toThrow(/2 programs found with slug "pull"/);
  });
});
