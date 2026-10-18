/**
 * OUT AI Phase 0 (18.10.2026) — the monetization lock on users/{uid} and the
 * new entitlements/{uid} + app_config/ai rules. firestore.rules only. NO
 * DEPLOY — the owner deploys manually from main after merge.
 *
 * 1. users/{uid}.subscriptionTier ('base' | 'premium_ai') used to be
 *    client-writable: the owner update rule only guarded four field groups,
 *    so a raw `updateDoc(users/me, { subscriptionTier: 'premium_ai' })` from
 *    the browser console passed. Group F (noEntitlementFieldsChanged) now
 *    locks it on update, and create rejects it outright.
 * 2. entitlements/{uid}: owner read, super/system admin write, no client
 *    write by the owner (a client-writable entitlement is a free upgrade).
 * 3. app_config/ai (budget + kill switch): not public like the rest of
 *    app_config; only a super/system admin may write it.
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
import { doc, getDoc, setDoc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';

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

const REGULAR = 'regular_uid';
const BASE_TIER = 'base_tier_uid';
const OTHER = 'other_uid';

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    // A plain core.role=='admin' user: satisfies isAdmin(), NOT isSuperAdminOnly().
    await setDoc(doc(db, 'users', 'role_admin_uid'), { core: { name: 'RoleAdmin', role: 'admin' } });
    await setDoc(doc(db, 'users', REGULAR), { core: { name: 'Regular' } });
    await setDoc(doc(db, 'users', BASE_TIER), { core: { name: 'Base' }, subscriptionTier: 'base' });
    await setDoc(doc(db, 'users', OTHER), { core: { name: 'Other' } });
    await setDoc(doc(db, 'entitlements', REGULAR), {
      aiCoach: { active: true, source: 'free_launch', until: Timestamp.fromMillis(Date.now() + 86_400_000) },
    });
    await setDoc(doc(db, 'entitlements', OTHER), { aiCoach: { active: false, source: 'paid' } });
    await setDoc(doc(db, 'app_config', 'ai'), { dailyBudgetUsd: 5, killSwitch: false });
    await setDoc(doc(db, 'app_config', 'xp_settings'), { multiplier: 1 });
  });
}

const regular = () => env.authenticatedContext(REGULAR, { email: 'someone@example.com' }).firestore();
const baseTier = () => env.authenticatedContext(BASE_TIER, { email: 'base@example.com' }).firestore();
const superAdmin = () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }).firestore();
const roleAdmin = () => env.authenticatedContext('role_admin_uid', { email: 'manager@example.com' }).firestore();

async function testSubscriptionTierLock() {
  console.log('\nusers/{uid}.subscriptionTier — owner can no longer self-upgrade');

  await it('[DENY] owner sets subscriptionTier: premium_ai on a doc that had none', async () => {
    await assertFails(updateDoc(doc(regular(), 'users', REGULAR), { subscriptionTier: 'premium_ai' }));
  });
  await it('[DENY] owner flips subscriptionTier base → premium_ai', async () => {
    await assertFails(updateDoc(doc(baseTier(), 'users', BASE_TIER), { subscriptionTier: 'premium_ai' }));
  });
  await it('[DENY] owner deletes subscriptionTier', async () => {
    await assertFails(updateDoc(doc(baseTier(), 'users', BASE_TIER), { subscriptionTier: deleteField() }));
  });
  await it('[DENY] owner sets subscriptionTier via merge setDoc', async () => {
    await assertFails(setDoc(doc(regular(), 'users', REGULAR), { subscriptionTier: 'premium_ai' }, { merge: true }));
  });
  await it('[DENY] owner creates own doc with subscriptionTier', async () => {
    const ctx = env.authenticatedContext('fresh_uid', { email: 'fresh@example.com' }).firestore();
    await assertFails(setDoc(doc(ctx, 'users', 'fresh_uid'), { core: { name: 'Fresh' }, subscriptionTier: 'premium_ai' }));
  });
  await it('[ALLOW] owner creates own doc without subscriptionTier (regression)', async () => {
    const ctx = env.authenticatedContext('fresh2_uid', { email: 'fresh2@example.com' }).firestore();
    await assertSucceeds(setDoc(doc(ctx, 'users', 'fresh2_uid'), { core: { name: 'Fresh2' } }));
  });
  await it('[ALLOW] owner updates an unrelated field (regression)', async () => {
    await assertSucceeds(updateDoc(doc(baseTier(), 'users', BASE_TIER), { 'core.name': 'Renamed' }));
  });
  await it('[ALLOW] owner re-writes the SAME subscriptionTier value (full-doc save)', async () => {
    await assertSucceeds(setDoc(doc(baseTier(), 'users', BASE_TIER), { subscriptionTier: 'base' }, { merge: true }));
  });
  await it('[ALLOW] super admin sets subscriptionTier', async () => {
    await assertSucceeds(updateDoc(doc(superAdmin(), 'users', REGULAR), { subscriptionTier: 'premium_ai' }));
  });
}

async function testEntitlements() {
  console.log('\nentitlements/{uid} — owner read, super/system admin write');

  await it('[ALLOW] owner reads own entitlement', async () => {
    await assertSucceeds(getDoc(doc(regular(), 'entitlements', REGULAR)));
  });
  await it('[DENY] owner reads someone else\'s entitlement', async () => {
    await assertFails(getDoc(doc(regular(), 'entitlements', OTHER)));
  });
  await it('[DENY] unauthenticated reads an entitlement', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'entitlements', REGULAR)));
  });
  await it('[DENY] owner creates own entitlement', async () => {
    const ctx = env.authenticatedContext('fresh3_uid', { email: 'fresh3@example.com' }).firestore();
    await assertFails(setDoc(doc(ctx, 'entitlements', 'fresh3_uid'), { aiCoach: { active: true, source: 'paid' } }));
  });
  await it('[DENY] owner activates own entitlement', async () => {
    await assertFails(updateDoc(doc(regular(), 'entitlements', REGULAR), { 'aiCoach.active': true }));
  });
  await it('[DENY] owner extends own entitlement', async () => {
    await assertFails(updateDoc(doc(regular(), 'entitlements', REGULAR), {
      'aiCoach.until': Timestamp.fromMillis(Date.now() + 365 * 86_400_000),
    }));
  });
  await it('[DENY] plain role=admin (not super/system) writes an entitlement', async () => {
    await assertFails(updateDoc(doc(roleAdmin(), 'entitlements', OTHER), { 'aiCoach.active': true }));
  });
  await it('[ALLOW] super admin writes an entitlement', async () => {
    await assertSucceeds(updateDoc(doc(superAdmin(), 'entitlements', OTHER), { 'aiCoach.active': true }));
  });
}

async function testAppConfigAi() {
  console.log('\napp_config/ai — not public, super/system admin write');

  await it('[DENY] unauthenticated reads app_config/ai', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'app_config', 'ai')));
  });
  await it('[DENY] regular user reads app_config/ai', async () => {
    await assertFails(getDoc(doc(regular(), 'app_config', 'ai')));
  });
  await it('[DENY] regular user flips the kill switch', async () => {
    await assertFails(updateDoc(doc(regular(), 'app_config', 'ai'), { killSwitch: true }));
  });
  await it('[DENY] plain role=admin raises the budget', async () => {
    await assertFails(updateDoc(doc(roleAdmin(), 'app_config', 'ai'), { dailyBudgetUsd: 10_000 }));
  });
  await it('[ALLOW] super admin reads + writes app_config/ai', async () => {
    await assertSucceeds(getDoc(doc(superAdmin(), 'app_config', 'ai')));
    await assertSucceeds(updateDoc(doc(superAdmin(), 'app_config', 'ai'), { killSwitch: true }));
  });
  await it('[ALLOW] other app_config docs stay publicly readable (regression)', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'app_config', 'xp_settings')));
  });
  await it('[ALLOW] plain role=admin still writes other app_config docs (regression)', async () => {
    await assertSucceeds(updateDoc(doc(roleAdmin(), 'app_config', 'xp_settings'), { multiplier: 2 }));
  });
}

async function testUsageLedgersClosed() {
  console.log('\nai_usage / ai_usage_global — no client access (Admin SDK only)');

  await it('[DENY] owner reads own ai_usage doc', async () => {
    await assertFails(getDoc(doc(regular(), 'ai_usage', `${REGULAR}_2026-10-18`)));
  });
  await it('[DENY] owner forges own ai_usage doc', async () => {
    await assertFails(setDoc(doc(regular(), 'ai_usage', `${REGULAR}_2026-10-18`), { inputTokens: 0 }));
  });
  await it('[DENY] super admin (non-root) writes the global ledger', async () => {
    await assertFails(setDoc(doc(superAdmin(), 'ai_usage_global', '2026-10-18'), { costUsd: 0 }));
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
  console.log(`\nai entitlements: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('users.subscriptionTier lock', testSubscriptionTierLock);
wrapSuite('entitlements/{uid}', testEntitlements);
wrapSuite('app_config/ai', testAppConfigAi);
wrapSuite('ai usage ledgers', testUsageLedgersClosed);
