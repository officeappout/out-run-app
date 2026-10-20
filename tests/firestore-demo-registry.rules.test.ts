/**
 * Demo world (20.10.2026, owner-approved — agent-briefs/demo-users-design.md PR 1).
 * firestore.rules only. NO DEPLOY — David deploys manually from main after merge.
 *
 *   demo_registry/**   server-only allow-list (Admin SDK). No client — not even a
 *                      super admin — may read or write it. The ROOT ADMIN FALLBACK
 *                      still reaches it for the two root accounts ([ROOT] case).
 *   users.core.demo    the demo stamp — an owner can't set it at create, nor add,
 *                      change or remove it on update. Every other owner write is
 *                      unchanged (pinned by the [ALLOW] cases).
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
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteField } from 'firebase/firestore';

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

const VIEWERS = ['demo_registry', 'viewers'] as const;
const STAMP = { tenantId: 'demo-city', personaId: 'walk_senior_8k', v: 1 };

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    // A demo-stamped doc whose "owner" signs in (cannot happen for real demo
    // users — they have no Auth — but pins that the stamp is immutable).
    await setDoc(doc(db, 'users', 'stamped_uid'), { core: { name: 'Stamped', demo: STAMP } });
    await setDoc(doc(db, ...VIEWERS), { uids: ['viewer_uid'] });
  });
}

type Who = { label: string; ctx: () => ReturnType<RulesTestEnvironment['authenticatedContext']> };

function nonRootCallers(): Who[] {
  return [
    { label: 'unauthenticated', ctx: () => env.unauthenticatedContext() as any },
    { label: 'regular user', ctx: () => env.authenticatedContext('regular_uid', { email: 'someone@example.com' }) },
    { label: 'listed viewer', ctx: () => env.authenticatedContext('viewer_uid', { email: 'viewer@example.com' }) },
    { label: 'NON-ROOT super-admin', ctx: () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }) },
  ];
}

async function testRegistryDenied() {
  console.log('\ndemo_registry/** — every non-root caller is DENIED');
  for (const who of nonRootCallers()) {
    await it(`[DENY] ${who.label} GETs demo_registry/viewers`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...VIEWERS)));
    });
    await it(`[DENY] ${who.label} LISTS demo_registry`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'demo_registry')));
    });
    await it(`[DENY] ${who.label} adds itself to the viewers`, async () => {
      await assertFails(updateDoc(doc(who.ctx().firestore(), ...VIEWERS), { uids: ['regular_uid'] }));
    });
    await it(`[DENY] ${who.label} creates a registry doc`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'demo_registry', 'forged'), { uids: [] }));
    });
  }
  await it('[ROOT] root (david@) GETs demo_registry/viewers → ALLOWED by the fallback, not by the block', async () => {
    const ctx = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), ...VIEWERS)));
  });
}

async function testDemoStampLocked() {
  console.log('\nusers.core.demo — Admin SDK only');
  await it('[DENY] owner creates own user doc with core.demo', async () => {
    const db = env.authenticatedContext('fresh_uid').firestore();
    await assertFails(setDoc(doc(db, 'users', 'fresh_uid'), { core: { name: 'Fresh', demo: STAMP } }));
  });
  await it('[ALLOW] owner creates own user doc without core.demo (unchanged)', async () => {
    const db = env.authenticatedContext('fresh2_uid').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'fresh2_uid'), { core: { name: 'Fresh' } }));
  });
  await it('[DENY] owner adds core.demo to own doc', async () => {
    const db = env.authenticatedContext('regular_uid').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'regular_uid'), { 'core.demo': STAMP }));
  });
  await it('[ALLOW] owner edits own name (unchanged)', async () => {
    const db = env.authenticatedContext('regular_uid').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'regular_uid'), { 'core.name': 'Renamed' }));
  });
  await it('[DENY] owner changes an existing core.demo', async () => {
    const db = env.authenticatedContext('stamped_uid').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'stamped_uid'), { 'core.demo.tenantId': 'sderot' }));
  });
  await it('[DENY] owner removes an existing core.demo', async () => {
    const db = env.authenticatedContext('stamped_uid').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'stamped_uid'), { 'core.demo': deleteField() }));
  });
  await it('[ALLOW] stamped owner edits another field, stamp untouched', async () => {
    const db = env.authenticatedContext('stamped_uid').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'stamped_uid'), { 'core.name': 'Still stamped' }));
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
  console.log(`\ndemo registry lockdown: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('demo_registry non-root denied', testRegistryDenied);
wrapSuite('users.core.demo locked', testDemoStampLocked);
