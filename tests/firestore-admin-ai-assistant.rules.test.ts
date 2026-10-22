/**
 * Admin-panel AI assistant (22.10.2026) — admin_ai_threads (+messages), admin_ai_audit,
 * admin_ai_stats: no client read or write (Admin SDK only, /api/admin/assistant/**).
 * firestore.rules only. NO DEPLOY — the owner deploys manually from main after merge.
 *
 * Known by design (documented in firestore.rules): the root-admin catch-all
 * `match /{document=**}` still ORs in, so a ROOT admin (david@/office@) can read these from a
 * client. Asserted below so a future change to the catch-all is noticed, not silent.
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
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

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

const SUPER = 'super_admin_uid';
const DAY = '2026-10-22';

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', SUPER), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'plain_uid'), { core: { name: 'Plain', ageGroup: 'adult' } });
    await setDoc(doc(db, 'admin_ai_threads', SUPER), { summary: 'synthetic', messageCount: 1 });
    await setDoc(doc(db, 'admin_ai_threads', SUPER, 'messages', 'm1'), { role: 'user', text: 'איפה טבלת הערים' });
    await setDoc(doc(db, 'admin_ai_audit', 'a1'), { uid: SUPER, route: 'model', costUsd: 0.01 });
    await setDoc(doc(db, 'admin_ai_stats', DAY), { costUsd: 0.1, localNav: 3 });
  });
}

const superAdmin = () => env.authenticatedContext(SUPER, { email: 'staff@example.com' }).firestore();
const plain = () => env.authenticatedContext('plain_uid', { email: 'plain@example.com' }).firestore();
const root = () => env.authenticatedContext('root_uid', { email: 'office@appout.co.il' }).firestore();

async function testDenied() {
  console.log('\nadmin_ai_* — no client access (non-root)');
  await it('[DENY] super admin reads OWN assistant thread from the client', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'admin_ai_threads', SUPER)));
  });
  await it('[DENY] super admin lists own messages', async () => {
    await assertFails(getDocs(collection(superAdmin(), 'admin_ai_threads', SUPER, 'messages')));
  });
  await it('[DENY] super admin forges an assistant message', async () => {
    await assertFails(setDoc(doc(superAdmin(), 'admin_ai_threads', SUPER, 'messages', 'forged'), { role: 'assistant', text: 'x' }));
  });
  await it('[DENY] super admin edits the thread summary', async () => {
    await assertFails(updateDoc(doc(superAdmin(), 'admin_ai_threads', SUPER), { summary: 'forged' }));
  });
  await it('[DENY] super admin reads the audit', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'admin_ai_audit', 'a1')));
  });
  await it('[DENY] super admin deletes an audit row', async () => {
    await assertFails(deleteDoc(doc(superAdmin(), 'admin_ai_audit', 'a1')));
  });
  await it('[DENY] super admin zeroes the admin budget ledger', async () => {
    await assertFails(setDoc(doc(superAdmin(), 'admin_ai_stats', DAY), { costUsd: 0 }, { merge: true }));
  });
  await it('[DENY] plain user reads stats', async () => {
    await assertFails(getDoc(doc(plain(), 'admin_ai_stats', DAY)));
  });
  await it('[DENY] unauthenticated reads a thread', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'admin_ai_threads', SUPER)));
  });
}

async function testRootCatchAll() {
  console.log('\nadmin_ai_* — root-admin catch-all (documented, by design)');
  await it('[ALLOW] root admin reads the audit via the catch-all', async () => {
    await assertSucceeds(getDoc(doc(root(), 'admin_ai_audit', 'a1')));
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
  console.log(`\nadmin ai assistant rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('admin_ai_* denied to clients', testDenied);
wrapSuite('admin_ai_* root catch-all', testRootCatchAll);
