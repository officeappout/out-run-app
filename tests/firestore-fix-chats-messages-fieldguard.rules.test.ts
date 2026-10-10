/**
 * LAYER-1 SECURITY FIX #2 — chats/{chatId}/messages/{messageId} field
 * guard (10.10.2026). firestore.rules only — no application code touched.
 *
 * The rule's own comment always said "Update: only to add uid to
 * readBy," but enforced nothing of the sort — any participant could
 * overwrite ANY field, including another participant's `text`/
 * `senderUid`. Now enforced for real.
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
import { doc, setDoc, updateDoc } from 'firebase/firestore';

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

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'userA'), { core: { name: 'A' } });
    await setDoc(doc(db, 'users', 'userB'), { core: { name: 'B' } });

    // chats: userA and userB are both real participants.
    await setDoc(doc(db, 'chats', 'chatAB'), { type: 'dm', participants: ['userA', 'userB'] });
    await setDoc(doc(db, 'chats', 'chatAB', 'messages', 'm1'), {
      senderUid: 'userA', text: 'original text', readBy: ['userA'],
    });
  });
}

async function testChatMessagesFieldGuardFix() {
  console.log('\nFix #2 — chats/messages: update restricted to readBy only');

  await it('[DENY] userB (a real participant) overwrites message text + senderUid → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(updateDoc(doc(ctx.firestore(), 'chats', 'chatAB', 'messages', 'm1'), {
      text: 'TAMPERED', senderUid: 'userB',
    }));
  });

  await it('[CONTROL] userB (a real participant) marks the message read by adding themselves to readBy → ALLOWED, unchanged', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'chats', 'chatAB', 'messages', 'm1'), {
      readBy: ['userA', 'userB'],
    }));
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
    }, 60_000);
  });
}

beforeAll(async () => {
  await setup();
}, 30_000);

afterAll(async () => {
  console.log(`\n=== firestore-fix-chats-messages-fieldguard.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('chats/messages field-guard fix', testChatMessagesFieldGuardFix);
