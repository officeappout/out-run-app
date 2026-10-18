/**
 * exercise_swaps / exercise_stats — soft-adaptation Phase 0 (18.10.2026).
 * firestore.rules only. NO DEPLOY — David deploys manually from main after merge.
 *
 *   exercise_swaps/{auto}  create: self-attributed (userId == auth.uid),
 *                          keys whitelisted (hasOnly), required keys present,
 *                          at == request.time, enums/types checked.
 *                          update/delete: never. read: isAdmin().
 *   exercise_stats/{id}    read: isAdmin(). write: never from a client
 *                          (Cloud Functions write via the Admin SDK).
 *
 * The pure drift guard (rule list === client EXERCISE_SWAP_FIELDS) runs
 * without an emulator: src/features/workout-engine/adaptation/__tests__/
 * exercise-swap-rules-whitelist.test.ts.
 *
 * Run: isolated emulator on 127.0.0.1:8089 — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let pass = 0;
let fail = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e?.message ?? e}`);
    fail++;
    failures.push(name);
  }
}

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

function swap(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user_a',
    at: serverTimestamp(),
    fromExerciseId: 'ex_pushup',
    fromName: 'שכיבות סמיכה',
    toExerciseId: 'ex_knee_pushup',
    toName: 'שכיבות סמיכה על הברכיים',
    domain: 'push',
    fromLevel: 5,
    toLevel: 3,
    userDomainLevel: 5,
    direction: 'lower',
    tab: 'adaptation',
    source: 'in_workout_coach_hint',
    flow: 'solo',
    userInitiated: true,
    location: 'park',
    segmentRole: 'main',
    setsDoneBefore: 2,
    lastSetReps: 4,
    rangeMin: 8,
    reason: 'too_hard',
    ...overrides,
  };
}

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'user_a'), { core: { name: 'A' } });
    await setDoc(doc(db, 'exercise_swaps', 'existing'), { ...swap(), at: Timestamp.now() });
    await setDoc(doc(db, 'exercise_stats', 'ex_pushup'), { swappedAway: 3, prescribedCompleted: 10 });
  });
}

async function testCreate() {
  console.log('\nexercise_swaps create');
  const a = () => env.authenticatedContext('user_a').firestore();

  await it('[ALLOW] a full, honest, self-attributed swap', async () => {
    await assertSucceeds(setDoc(doc(a(), 'exercise_swaps', 's_full'), swap()));
  });
  await it('[ALLOW] the minimal required shape', async () => {
    await assertSucceeds(setDoc(doc(a(), 'exercise_swaps', 's_min'), {
      userId: 'user_a', at: serverTimestamp(), fromExerciseId: 'a', toExerciseId: 'b',
      source: 'preview', userInitiated: true,
    }));
  });
  await it("[ALLOW] reason 'pain' (logged, never fed to adaptation)", async () => {
    await assertSucceeds(setDoc(doc(a(), 'exercise_swaps', 's_pain'), swap({ reason: 'pain' })));
  });
  await it('[DENY] attributed to another user', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_forged'), swap({ userId: 'user_b' })));
  });
  await it('[DENY] unauthenticated', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'exercise_swaps', 's_anon'), swap()));
  });
  await it('[DENY] an extra, non-whitelisted key', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_extra'), swap({ email: 'x@y.z' })));
  });
  await it('[DENY] missing a required key (source)', async () => {
    const s = swap();
    delete (s as Record<string, unknown>).source;
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_nosource'), s));
  });
  await it('[DENY] a client-chosen timestamp instead of request.time', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_time'), swap({ at: Timestamp.fromMillis(0) })));
  });
  await it('[DENY] an unknown reason / direction / tab', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_r'), swap({ reason: 'bored' })));
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_d'), swap({ direction: 'up' })));
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_t'), swap({ tab: 'other' })));
  });
  await it('[DENY] wrong types (userInitiated string, fromLevel string)', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_ty1'), swap({ userInitiated: 'true' })));
    await assertFails(setDoc(doc(a(), 'exercise_swaps', 's_ty2'), swap({ fromLevel: '5' })));
  });
}

async function testImmutableAndRead() {
  console.log('\nexercise_swaps update/delete/read + exercise_stats');
  const a = () => env.authenticatedContext('user_a').firestore();
  const admin = () => env.authenticatedContext('super_admin_uid').firestore();

  await it('[DENY] the author cannot update or delete a swap', async () => {
    await assertFails(updateDoc(doc(a(), 'exercise_swaps', 'existing'), { reason: 'too_easy' }));
    await assertFails(deleteDoc(doc(a(), 'exercise_swaps', 'existing')));
  });
  await it('[DENY] a regular user cannot read raw swaps (not even their own)', async () => {
    await assertFails(getDoc(doc(a(), 'exercise_swaps', 'existing')));
  });
  await it('[ALLOW] an admin reads raw swaps and the aggregate', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'exercise_swaps', 'existing')));
    await assertSucceeds(getDoc(doc(admin(), 'exercise_stats', 'ex_pushup')));
  });
  await it('[DENY] a regular user cannot read exercise_stats', async () => {
    await assertFails(getDoc(doc(a(), 'exercise_stats', 'ex_pushup')));
  });
  await it('[DENY] nobody writes exercise_stats from a client (not even a non-root admin)', async () => {
    await assertFails(setDoc(doc(a(), 'exercise_stats', 'ex_pushup'), { swappedAway: 0 }));
    await assertFails(setDoc(doc(admin(), 'exercise_stats', 'ex_pushup'), { swappedAway: 0 }));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) {
        throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above for details`);
      }
    });
  });
}

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  console.log(`\nexercise_swaps rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('exercise_swaps create', testCreate);
wrapSuite('exercise_swaps immutable + admin read', testImmutableAndRead);
