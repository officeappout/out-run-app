/**
 * site_content / content_suggestions — the shared FAQ / articles / help source (unified search,
 * 19.10.2026). firestore.rules only. NO DEPLOY — David deploys manually from main after merge.
 *
 *   site_content: a PUBLISHED doc is readable by anyone (get + a list constrained to
 *   status == 'published'); drafts are not; nobody writes from a client (Admin SDK only).
 *   content_suggestions: no client access at all.
 * Like admin_costs, the ROOT ADMIN FALLBACK still reaches both for the two root accounts.
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
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

const PUBLISHED = ['site_content', 'help-schedule'] as const;
const DRAFT = ['site_content', 'article-first-pull-up-he'] as const;
const SUGGESTION = ['content_suggestions', 'regular_uid_abc'] as const;

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', 'regular_uid'), { core: { name: 'Regular' } });
    await setDoc(doc(db, ...PUBLISHED), { type: 'help', status: 'published', q: 'איך מזיזים אימון?', a: ['…'] });
    await setDoc(doc(db, ...DRAFT), { type: 'article', status: 'draft', title: 'המתח הראשון' });
    await setDoc(doc(db, ...SUGGESTION), { uid: 'regular_uid', query: 'פרונט ליבר', status: 'new' });
    // the Marketing Hub queue (a different collection that happens to use status 'published')
    await setDoc(doc(db, 'content_items', 'mk1'), { title: 'רילס', status: 'published' });
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

async function testContentItems() {
  console.log('\nsite_content — published readable, drafts hidden, no client writes');
  for (const who of nonRootCallers()) {
    await it(`[ALLOW] ${who.label} GETs a published item`, async () => {
      await assertSucceeds(getDoc(doc(who.ctx().firestore(), ...PUBLISHED)));
    });
    await it(`[ALLOW] ${who.label} LISTS with status == published`, async () => {
      await assertSucceeds(getDocs(query(collection(who.ctx().firestore(), 'site_content'), where('status', '==', 'published'))));
    });
    await it(`[DENY] ${who.label} GETs a draft`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...DRAFT)));
    });
    await it(`[DENY] ${who.label} LISTS without the status constraint`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'site_content')));
    });
    await it(`[DENY] ${who.label} edits a published item`, async () => {
      await assertFails(updateDoc(doc(who.ctx().firestore(), ...PUBLISHED), { q: 'hacked' }));
    });
    await it(`[DENY] ${who.label} creates an item`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'site_content', 'forged'), { type: 'faq', status: 'published', q: 'x', a: ['y'] }));
    });
    await it(`[DENY] ${who.label} deletes an item`, async () => {
      await assertFails(deleteDoc(doc(who.ctx().firestore(), ...PUBLISHED)));
    });
  }
}

async function testMarketingHubUntouched() {
  console.log('\ncontent_items (Marketing Hub) — still admin-only, NOT public like site_content');
  for (const who of nonRootCallers().slice(0, 2)) {
    await it(`[DENY] ${who.label} GETs a "published" marketing-hub item`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), 'content_items', 'mk1')));
    });
  }
}

async function testSuggestions() {
  console.log('\ncontent_suggestions — server only');
  for (const who of nonRootCallers()) {
    await it(`[DENY] ${who.label} GETs a suggestion`, async () => {
      await assertFails(getDoc(doc(who.ctx().firestore(), ...SUGGESTION)));
    });
    await it(`[DENY] ${who.label} LISTS suggestions`, async () => {
      await assertFails(getDocs(collection(who.ctx().firestore(), 'content_suggestions')));
    });
    await it(`[DENY] ${who.label} creates a suggestion directly`, async () => {
      await assertFails(setDoc(doc(who.ctx().firestore(), 'content_suggestions', 'forged'), { uid: 'regular_uid', query: 'x' }));
    });
  }
}

async function testRootFallbackReach() {
  console.log('\ncontent — ROOT still passes via the ROOT ADMIN FALLBACK (documents its reach)');
  await it('[ROOT] root (david@) GETs a draft → ALLOWED by the fallback', async () => {
    const ctx = env.authenticatedContext('root_uid', { email: 'david@appout.co.il' });
    await assertSucceeds(getDoc(doc(ctx.firestore(), ...DRAFT)));
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
  console.log(`\ncontent items rules: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('site_content published-only read, no client writes', testContentItems);
wrapSuite('content_suggestions server-only', testSuggestions);
wrapSuite('marketing hub content_items untouched', testMarketingHubUntouched);
wrapSuite('content root fallback reach', testRootFallbackReach);
