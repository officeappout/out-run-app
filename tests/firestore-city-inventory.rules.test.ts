/**
 * city_inventory/** lockdown (RC4 wave I2, 21.10.2026). firestore.rules only.
 * NO DEPLOY — David deploys manually from main after merge.
 *
 * city_inventory/{authorityId} and .../runs/{runId} are written by the Admin
 * SDK (scripts/city-inventory/run.ts --apply) and read by the Admin SDK in
 * /api/admin/city-mapping/inventory. No client — not even a super admin — may
 * read, list or write them. The ROOT ADMIN FALLBACK still reaches them for the
 * two root accounts (Firestore ORs rules); the [ROOT] case documents that.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   firebase emulators:exec --only firestore --config firebase-audit.json --project appout-1-audit-test \
 *     "npx vitest run tests/firestore-city-inventory.rules.test.ts"
 */
import { describe, beforeAll, afterAll, it as vitestIt } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, getDocs, collection, collectionGroup, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

const SUMMARY = ['city_inventory', 'auth_bsv'] as const;
const RUN = ['city_inventory', 'auth_bsv', 'runs', 'ci-1'] as const;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'system_admin_uid'), { core: { name: 'SystemAdmin', isSystemAdmin: true } });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    await setDoc(doc(db, ...SUMMARY), { authorityId: 'auth_bsv', city: 'באר שבע', readiness: { level: 'yellow', score: 62 } });
    await setDoc(doc(db, ...RUN), { authorityId: 'auth_bsv', runId: 'ci-1' });
  });
}

type Who = { label: string; ctx: () => ReturnType<RulesTestEnvironment['authenticatedContext']> };

function nonRootCallers(): Who[] {
  return [
    { label: 'unauthenticated', ctx: () => env.unauthenticatedContext() as any },
    { label: 'regular user', ctx: () => env.authenticatedContext('regular_uid', { email: 'someone@example.com' }) },
    { label: 'NON-ROOT super-admin', ctx: () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }) },
    { label: 'NON-ROOT system-admin', ctx: () => env.authenticatedContext('system_admin_uid', { email: 'sys@example.com' }) },
  ];
}

async function testNonRootDenied() {
  console.log('\ncity_inventory/** — every non-root caller is DENIED');
  for (const who of nonRootCallers()) {
    await it(`[DENY] ${who.label} GETs the summary`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...SUMMARY)));
    });
    await it(`[DENY] ${who.label} LISTS city_inventory`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'city_inventory')));
    });
    await it(`[DENY] ${who.label} GETs a run`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...RUN)));
    });
    await it(`[DENY] ${who.label} LISTS runs`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'city_inventory', 'auth_bsv', 'runs')));
    });
    await it(`[DENY] ${who.label} collectionGroup('runs')`, async () => {
      await assertFails(getDocs(collectionGroup(who.ctx().firestore(), 'runs')));
    });
    await it(`[DENY] ${who.label} creates a summary`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'city_inventory', 'forged'), { authorityId: 'forged' }));
    });
    await it(`[DENY] ${who.label} updates the readiness`, async () => {
      await assertFails(updateDoc(doc(who.ctx().firestore(), ...SUMMARY), { 'readiness.level': 'green' }));
    });
    await it(`[DENY] ${who.label} writes a run`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'city_inventory', 'auth_bsv', 'runs', 'forged'), { runId: 'forged' }));
    });
    await it(`[DENY] ${who.label} deletes the summary`, async () => {
      await assertFails(deleteDoc(doc(who.ctx().firestore(), ...SUMMARY)));
    });
  }
}

async function testRootFallbackReach() {
  console.log('\ncity_inventory — ROOT still passes via the ROOT ADMIN FALLBACK (documents its reach)');
  await it('[ROOT] root (david@) GETs the summary → ALLOWED by the fallback, not by the block', async () => {
    const ctx = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), ...SUMMARY)));
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
  await setup();
});

afterAll(async () => {
  console.log(`\ncity inventory lockdown: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('city inventory non-root denied', testNonRootDenied);
wrapSuite('city inventory root fallback reach', testRootFallbackReach);
