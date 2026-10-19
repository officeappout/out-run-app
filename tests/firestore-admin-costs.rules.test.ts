/**
 * admin_costs / admin_cost_items lockdown — the /admin/costs dashboard collections
 * (19.10.2026). firestore.rules only. NO DEPLOY — David deploys manually from main after merge.
 *
 * Both collections are written and read only by the Admin SDK in the super-admin
 * /api/admin/costs/** routes. No client — not even a super admin — may read or write them
 * directly. Like agents/**, the ROOT ADMIN FALLBACK still reaches them for the two root
 * accounts (Firestore ORs rules); the [ROOT] case documents that reach so a change shows here.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
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
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';

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

const MONTH = ['admin_costs', '2026-10'] as const;
const ITEM = ['admin_cost_items', 'item1'] as const;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    await setDoc(doc(db, ...MONTH), { month: '2026-10', fx: { USD: 3.1, EUR: 3.48, source: 'default' } });
    await setDoc(doc(db, ...ITEM), { name: 'Apple Developer', amount: 99, currency: 'USD', cadence: 'yearly', startDate: '2026-01-10', active: true });
  });
}

type Who = { label: string; ctx: () => ReturnType<RulesTestEnvironment['authenticatedContext']> };

function nonRootCallers(): Who[] {
  return [
    { label: 'unauthenticated', ctx: () => env.unauthenticatedContext() as any },
    { label: 'regular user', ctx: () => env.authenticatedContext('regular_uid', { email: 'someone@example.com' }) },
    { label: 'NON-ROOT super-admin', ctx: () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }) },
  ];
}

async function testNonRootDenied() {
  console.log('\nadmin_costs/** + admin_cost_items/** — every non-root caller is DENIED');
  for (const who of nonRootCallers()) {
    await it(`[DENY] ${who.label} GETs admin_costs/2026-10`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...MONTH)));
    });
    await it(`[DENY] ${who.label} LISTS admin_costs`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'admin_costs')));
    });
    await it(`[DENY] ${who.label} overwrites the month FX`, async () => {
      await assertFails(updateDoc(doc(who.ctx().firestore(), ...MONTH), { 'fx.USD': 1 }));
    });
    await it(`[DENY] ${who.label} GETs a cost item`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...ITEM)));
    });
    await it(`[DENY] ${who.label} LISTS admin_cost_items`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'admin_cost_items')));
    });
    await it(`[DENY] ${who.label} creates a cost item`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'admin_cost_items', 'forged'), { name: 'x', amount: 1 }));
    });
  }
}

async function testRootFallbackReach() {
  console.log('\nadmin costs — ROOT still passes via the ROOT ADMIN FALLBACK (documents its reach)');
  await it('[ROOT] root (david@) GETs admin_costs/2026-10 → ALLOWED by the fallback, not by the block', async () => {
    const ctx = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), ...MONTH)));
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
  console.log(`\nadmin costs lockdown: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('admin costs non-root denied', testNonRootDenied);
wrapSuite('admin costs root fallback reach', testRootFallbackReach);
