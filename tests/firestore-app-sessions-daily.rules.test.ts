/**
 * app_sessions_daily/{uid}_{date} (enable_app_session_signal, 22.10.2026). firestore.rules only.
 * NO DEPLOY — David deploys manually from main after merge, before switching the flag on.
 *
 * Writer: src/features/analytics/app-session.ts — setDoc(merge) with increment(1) on
 * `sessions` (and `pushSessions` when the session came from a push tap). Each write may add
 * exactly one session; only the owner writes its own day doc; admin-only read; no delete.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   firebase emulators:exec --only firestore --config firebase-audit.json --project appout-1-audit-test \
 *     "npx vitest run tests/firestore-app-sessions-daily.rules.test.ts"
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, increment, serverTimestamp, Timestamp } from 'firebase/firestore';

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

const DAY = '2026-10-22';
const OWN = `user_a_${DAY}`;

const userA = () => env.authenticatedContext('user_a', { email: 'a@example.com' }).firestore();
const userB = () => env.authenticatedContext('user_b', { email: 'b@example.com' }).firestore();
const admin = () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }).firestore();

/** Exactly what app-session.ts buildSessionWrite sends. */
const appWrite = (viaPush = false, platform = 'ios') => ({
  uid: 'user_a',
  date: DAY,
  sessions: increment(1),
  ...(viaPush ? { pushSessions: increment(1) } : {}),
  platform,
  lastAt: serverTimestamp(),
});

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(ctx.firestore(), 'users', 'user_a'), { core: { name: 'A' } });
  });
}

async function testOwnerWrites() {
  console.log('\napp_sessions_daily — the app\'s own writes');
  await reset();
  await it('[ALLOW] first session of the day (create, sessions = 1)', async () => {
    await assertSucceeds(setDoc(doc(userA(), 'app_sessions_daily', OWN), appWrite(), { merge: true }));
  });
  await it('[ALLOW] next session (+1)', async () => {
    await assertSucceeds(setDoc(doc(userA(), 'app_sessions_daily', OWN), appWrite(), { merge: true }));
  });
  await it('[ALLOW] a push session (+1 sessions, +1 pushSessions)', async () => {
    await assertSucceeds(setDoc(doc(userA(), 'app_sessions_daily', OWN), appWrite(true, 'android'), { merge: true }));
  });
  await it('[ALLOW] first session created from a push', async () => {
    await assertSucceeds(setDoc(doc(userA(), 'app_sessions_daily', `user_a_2026-10-23`), { ...appWrite(true), date: '2026-10-23' }, { merge: true }));
  });
}

async function testForged() {
  console.log('\napp_sessions_daily — forged / inflated writes are DENIED');
  await reset();
  await it('[DENY] create with sessions = 5', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), { ...appWrite(), sessions: 5 }));
  });
  await it('[DENY] another user\'s doc', async () => {
    await assertFails(setDoc(doc(userB(), 'app_sessions_daily', OWN), appWrite(), { merge: true }));
  });
  await it('[DENY] doc id that doesn\'t match uid_date', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', 'user_a_2026-01-01'), appWrite(), { merge: true }));
  });
  await it('[DENY] extra field (location)', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), { ...appWrite(), lat: 32.1 }, { merge: true }));
  });
  await it('[DENY] client-chosen lastAt', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), { ...appWrite(), lastAt: Timestamp.fromMillis(0) }, { merge: true }));
  });
  await it('[DENY] unknown platform', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), appWrite(false, 'desktop'), { merge: true }));
  });
  await it('[DENY] unauthenticated', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'app_sessions_daily', OWN), appWrite(), { merge: true }));
  });
  await assertSucceeds(setDoc(doc(userA(), 'app_sessions_daily', OWN), appWrite(), { merge: true }));
  await it('[DENY] update jumping +2 sessions', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), { ...appWrite(), sessions: increment(2) }, { merge: true }));
  });
  await it('[DENY] pushSessions above sessions', async () => {
    await assertFails(setDoc(doc(userA(), 'app_sessions_daily', OWN), { ...appWrite(), pushSessions: 7 }, { merge: true }));
  });
  await it('[DENY] owner deletes', async () => {
    await assertFails(deleteDoc(doc(userA(), 'app_sessions_daily', OWN)));
  });
}

async function testReads() {
  console.log('\napp_sessions_daily — reads');
  await it('[DENY] owner reads own doc', async () => {
    await assertFails(getDoc(doc(userA(), 'app_sessions_daily', OWN)));
  });
  await it('[DENY] user lists the collection', async () => {
    await assertFails(getDocs(collection(userA(), 'app_sessions_daily')));
  });
  await it('[ALLOW] admin reads / lists', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'app_sessions_daily', OWN)));
    await assertSucceeds(getDocs(collection(admin(), 'app_sessions_daily')));
  });
}

function wrapSuite(name: string, fn: () => Promise<void>) {
  describe(name, () => {
    vitestIt('runs', async () => {
      const before = fail;
      await fn();
      if (fail > before) throw new Error(`${fail - before} case(s) failed in "${name}" — see console output above`);
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
});

afterAll(async () => {
  console.log(`\napp_sessions_daily rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('app sessions owner writes', testOwnerWrites);
wrapSuite('app sessions forged writes', testForged);
wrapSuite('app sessions reads', testReads);
