/**
 * "קלי AI" (18.10.2026) — ai_coach_threads/{uid} + messages: owner read, no client
 * writes (the chat API writes with the Admin SDK). firestore.rules only. NO DEPLOY — the
 * owner deploys manually from main after merge.
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
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

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

const OWNER = 'owner_uid';
const OTHER = 'other_uid';

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super_admin_uid'), { core: { name: 'SuperAdmin', isSuperAdmin: true } });
    await setDoc(doc(db, 'users', OWNER), { core: { name: 'Owner', ageGroup: 'adult' } });
    await setDoc(doc(db, 'users', OTHER), { core: { name: 'Other', ageGroup: 'adult' } });
    await setDoc(doc(db, 'ai_coach_threads', OWNER), { summary: 'synthetic', messageCount: 2 });
    await setDoc(doc(db, 'ai_coach_threads', OWNER, 'messages', 'm1'), {
      role: 'user',
      text: 'תבני לי אימון',
      cards: [],
      createdAt: Timestamp.fromMillis(1_760_000_000_000),
    });
    await setDoc(doc(db, 'ai_coach_threads', OTHER), { summary: 'synthetic other' });
    await setDoc(doc(db, 'ai_coach_threads', OTHER, 'messages', 'm1'), { role: 'user', text: 'x', cards: [] });
  });
}

const owner = () => env.authenticatedContext(OWNER, { email: 'owner@example.com' }).firestore();
const superAdmin = () => env.authenticatedContext('super_admin_uid', { email: 'staff@example.com' }).firestore();

async function testReads() {
  console.log('\nai_coach_threads — reads');
  await it('[ALLOW] owner reads own thread doc', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'ai_coach_threads', OWNER)));
  });
  await it('[ALLOW] owner lists own messages', async () => {
    await assertSucceeds(getDocs(collection(owner(), 'ai_coach_threads', OWNER, 'messages')));
  });
  await it("[DENY] owner reads someone else's thread", async () => {
    await assertFails(getDoc(doc(owner(), 'ai_coach_threads', OTHER)));
  });
  await it("[DENY] owner lists someone else's messages", async () => {
    await assertFails(getDocs(collection(owner(), 'ai_coach_threads', OTHER, 'messages')));
  });
  await it('[DENY] unauthenticated reads a thread', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'ai_coach_threads', OWNER)));
  });
  await it('[DENY] super admin (non-root) reads a user thread', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'ai_coach_threads', OWNER)));
  });
}

async function testWrites() {
  console.log('\nai_coach_threads — no client writes');
  await it('[DENY] owner creates an assistant message', async () => {
    await assertFails(
      setDoc(doc(owner(), 'ai_coach_threads', OWNER, 'messages', 'forged'), { role: 'assistant', text: 'forged', cards: [] }),
    );
  });
  await it('[DENY] owner edits own message', async () => {
    await assertFails(updateDoc(doc(owner(), 'ai_coach_threads', OWNER, 'messages', 'm1'), { text: 'edited' }));
  });
  await it('[DENY] owner deletes own message', async () => {
    await assertFails(deleteDoc(doc(owner(), 'ai_coach_threads', OWNER, 'messages', 'm1')));
  });
  await it('[DENY] owner writes a pending tool turn', async () => {
    await assertFails(updateDoc(doc(owner(), 'ai_coach_threads', OWNER), { pending: { toolUseId: 'x', json: '{}' } }));
  });
  await it('[DENY] owner rewrites the summary', async () => {
    await assertFails(setDoc(doc(owner(), 'ai_coach_threads', OWNER), { summary: 'forged' }, { merge: true }));
  });
  await it('[DENY] owner creates a thread for a fresh account', async () => {
    const ctx = env.authenticatedContext('fresh_uid', { email: 'fresh@example.com' }).firestore();
    await assertFails(setDoc(doc(ctx, 'ai_coach_threads', 'fresh_uid'), { summary: '' }));
  });
  // Unified Kelly (kelly_unified_v1): read state / the admin queue flag stay server-only —
  // the client marks read through POST /api/ai-coach/thread.
  await it('[DENY] owner zeroes unreadForUser directly', async () => {
    await assertFails(setDoc(doc(owner(), 'ai_coach_threads', OWNER), { unreadForUser: 0 }, { merge: true }));
  });
  await it('[DENY] owner clears needsHuman', async () => {
    await assertFails(updateDoc(doc(owner(), 'ai_coach_threads', OWNER), { needsHuman: false }));
  });
  await it('[DENY] owner forges a team message', async () => {
    await assertFails(
      setDoc(doc(owner(), 'ai_coach_threads', OWNER, 'messages', 'forged_team'), { role: 'assistant', source: 'human', text: 'x', cards: [] }),
    );
  });
  await it('[DENY] super admin (non-root) writes a thread', async () => {
    await assertFails(setDoc(doc(superAdmin(), 'ai_coach_threads', OWNER), { summary: 'x' }, { merge: true }));
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
  console.log(`\nai coach threads: ${pass} passed, ${fail} failed${failures.length ? `\n  - ${failures.join('\n  - ')}` : ''}`);
  if (env) await env.cleanup();
});

wrapSuite('ai_coach_threads reads', testReads);
wrapSuite('ai_coach_threads writes', testWrites);
