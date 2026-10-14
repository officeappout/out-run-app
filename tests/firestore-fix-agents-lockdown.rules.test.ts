/**
 * agents/** lockdown — the agents panel collections (on-call agent, Ops
 * stage 3, 14.10.2026). firestore.rules only. NO DEPLOY — David deploys
 * manually from main after merge.
 *
 * agents/{agentId} and agents/{agentId}/findings/{id} are written by Cloud
 * Functions and read through root-only server routes, both via the Admin
 * SDK. No client should reach them.
 *
 * What this suite actually guards: the explicit `match /agents/{document=**}
 * { allow read, write: if false; }` block cannot override the ROOT ADMIN
 * FALLBACK (Firestore ORs matching rules), so root still passes on the
 * client. The real protection is that the fallback is root-only — the
 * [DENY] cases below fail if it is ever widened (e.g. back to isAdmin()),
 * and the [ROOT] case documents the fallback's reach so a future change to
 * it shows up here instead of silently.
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
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
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

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

const AGENT = ['agents', 'oncall'] as const;
const FINDING = ['agents', 'oncall', 'findings', 'sentry-123-new'] as const;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // A non-root super-admin: satisfies isAdmin(), NOT isRootAdmin().
    await setDoc(doc(db, 'users', 'super_admin_uid'), {
      core: { name: 'SuperAdmin', isSuperAdmin: true },
    });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    await setDoc(doc(db, ...AGENT), { lastRunAt: Timestamp.now(), consecutiveFailures: 0, schemaVersion: 1 });
    await setDoc(doc(db, ...FINDING), {
      kind: 'new', topic: '/map', title: 'TypeError: x is undefined', severity: 'high',
      readAt: null, createdAt: Timestamp.now(), schemaVersion: 1,
    });
  });
}

type Who = { label: string; ctx: () => ReturnType<RulesTestEnvironment['authenticatedContext']> };

function nonRootCallers(): Who[] {
  return [
    { label: 'unauthenticated', ctx: () => env.unauthenticatedContext() as any },
    { label: 'regular user', ctx: () => env.authenticatedContext('regular_uid', { email: 'someone@example.com' }) },
    { label: 'NON-ROOT super-admin (isAdmin() true)', ctx: () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }) },
  ];
}

async function testNonRootDenied() {
  console.log('\nagents/** — every non-root caller is DENIED (read, list, create, update)');

  for (const who of nonRootCallers()) {
    await it(`[DENY] ${who.label} GETs agents/oncall`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...AGENT)));
    });
    await it(`[DENY] ${who.label} LISTS agents/oncall/findings`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'agents', 'oncall', 'findings')));
    });
    await it(`[DENY] ${who.label} GETs a finding`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...FINDING)));
    });
    await it(`[DENY] ${who.label} marks a finding read (update readAt)`, async () => {
      await assertFails(updateDoc(doc(who.ctx().firestore(), ...FINDING), { readAt: Timestamp.now() }));
    });
    await it(`[DENY] ${who.label} forges a finding (create)`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'agents', 'oncall', 'findings', 'forged'), {
        kind: 'new', title: 'forged', readAt: null,
      }));
    });
  }
}

async function testRootFallbackReach() {
  console.log('\nagents/** — ROOT still passes via the ROOT ADMIN FALLBACK (documents its reach)');

  await it('[ROOT] root (david@) GETs a finding → ALLOWED by the fallback, not by the agents block', async () => {
    const ctx = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), ...FINDING)));
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
  console.log(`\nagents lockdown: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('agents non-root denied', testNonRootDenied);
wrapSuite('agents root fallback reach', testRootFallbackReach);
