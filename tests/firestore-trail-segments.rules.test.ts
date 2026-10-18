/**
 * trail_segments — trails pipeline (feat/trails-apply, 18.10.2026).
 * firestore.rules only. NO DEPLOY — David deploys manually from main after merge.
 *
 *   read:  any signed-in user (get + list). Anonymous: denied.
 *   write: nobody from a client (create/update/delete denied for users and
 *          non-root admins). Written only by scripts/trails --apply (Admin SDK).
 *
 * The ROOT ADMIN FALLBACK (Firestore ORs rules) still lets the two root
 * accounts write — documented by the [ROOT] case, same as agents/**.
 *
 * Run: isolated emulator on 127.0.0.1:8089 — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
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
  } catch (e: unknown) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    fail++;
    failures.push(name);
  }
}

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;
const SEG = ['trail_segments', 'seg_1_2_3'] as const;
const segData = { lengthM: 120, authorityId: 'auth_x', license: 'ODbL-1.0', geometry: [{ lng: 34.5, lat: 31.5 }, { lng: 34.501, lat: 31.5 }] };

async function setup() {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules, host: '127.0.0.1', port: 8089 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    await setDoc(doc(db, ...SEG), segData);
  });
}

const user = () => env.authenticatedContext('regular_uid', { email: 'someone@example.com' }).firestore();
const nonRootAdmin = () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function testRead() {
  console.log('\ntrail_segments read');
  await it('[ALLOW] signed-in user GETs a segment', async () => { await assertSucceeds(getDoc(doc(user(), ...SEG))); });
  await it('[ALLOW] signed-in user LISTS segments', async () => { await assertSucceeds(getDocs(collection(user(), 'trail_segments'))); });
  await it('[DENY] anonymous GET', async () => { await assertFails(getDoc(doc(anon(), ...SEG))); });
  await it('[DENY] anonymous LIST', async () => { await assertFails(getDocs(collection(anon(), 'trail_segments'))); });
}

async function testWrite() {
  console.log('\ntrail_segments write — no client (non-root) may write');
  for (const [label, db] of [['regular user', user], ['NON-ROOT super-admin', nonRootAdmin], ['anonymous', anon]] as const) {
    await it(`[DENY] ${label} creates a segment`, async () => { await assertFails(setDoc(doc(db(), 'trail_segments', 'forged'), segData)); });
    await it(`[DENY] ${label} updates a segment`, async () => { await assertFails(updateDoc(doc(db(), ...SEG), { lengthM: 1 })); });
    await it(`[DENY] ${label} deletes a segment`, async () => { await assertFails(deleteDoc(doc(db(), ...SEG))); });
  }
  await it('[ROOT] root (david@) can still write via the ROOT ADMIN FALLBACK (documents its reach)', async () => {
    const root = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' }).firestore();
    await assertSucceeds(updateDoc(doc(root, ...SEG), { lengthM: 120 }));
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

beforeAll(async () => { await setup(); });
afterAll(async () => {
  console.log(`\ntrail_segments rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('trail_segments read', testRead);
wrapSuite('trail_segments write', testWrite);
