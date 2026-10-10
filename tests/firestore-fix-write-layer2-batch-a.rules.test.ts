/**
 * LAYER-2 SECURITY FIXES — BATCH A (10.10.2026). firestore.rules only,
 * no application code touched, no deploy.
 *
 * Fix #1 — sharedWorkouts create: now requires self-attribution
 * (request.auth.uid == request.resource.data.creatorId). Before, create
 * had no field guard at all — anyone could forge a share attributed to a
 * different user's uid.
 *
 * Fix #2 — feed_posts/{postId}/reactions: write is now split by verb and
 * restricted to the owner only — reactionId == request.auth.uid (the
 * wildcard variable) AND, for create/update, the `uid` field must match.
 * Before, write (create+update+delete combined) had zero ownership
 * check — any authenticated non-anonymous user could forge a reaction
 * attributed to someone else, or modify/delete an existing one that
 * wasn't theirs.
 *
 * Each fix: a deny case (the attack, now blocked) + a control case
 * (legitimate use — your own reaction / your own shared workout — still
 * works).
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
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

    // An existing shared workout owned by userA, for the update/delete
    // ownership-preserved checks.
    await setDoc(doc(db, 'sharedWorkouts', 'swA'), { creatorId: 'userA', title: 'A real workout' });

    // A feed post + an existing reaction owned by userA.
    await setDoc(doc(db, 'feed_posts', 'post1'), { authorUid: 'userA', audience: 'public' });
    await setDoc(doc(db, 'feed_posts', 'post1', 'reactions', 'userA'), { uid: 'userA', type: 'fire' });
  });
}

async function testSharedWorkoutsCreatorIdFix() {
  console.log('\nFix #1 — sharedWorkouts create requires self-attribution');

  await it('[DENY] userB creates a sharedWorkouts doc forging creatorId=userA → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(setDoc(doc(ctx.firestore(), 'sharedWorkouts', 'forged1'), {
      creatorId: 'userA', title: 'forged',
    }));
  });

  await it('[CONTROL] userA shares their OWN workout (creatorId=userA) → still ALLOWED, unchanged', async () => {
    const ctx = env.authenticatedContext('userA');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'sharedWorkouts', 'legit1'), {
      creatorId: 'userA', title: 'my real workout',
    }));
  });
}

async function testReactionsOwnershipFix() {
  console.log('\nFix #2 — feed_posts/reactions write restricted to owner only');

  await it('[DENY] userB creates a reaction doc forging reactionId=userA (impersonating userA\'s reaction) → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userA'), {
      uid: 'userA', type: 'high_five',
    }));
  });

  await it('[DENY] userB updates userA\'s EXISTING reaction (type tamper) → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(updateDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userA'), {
      type: 'high_five',
    }));
  });

  await it('[DENY] userB deletes userA\'s EXISTING reaction → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userA')));
  });

  await it('[DENY] userB creates a reaction with reactionId=userB but a forged uid field (uid=userA) → now DENIED (both checks required, not just the docId)', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(setDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userB'), {
      uid: 'userA', type: 'fire',
    }));
  });

  await it('[CONTROL] userB creates their OWN reaction (reactionId=userB, uid=userB) → still ALLOWED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userB'), {
      uid: 'userB', type: 'fire',
    }));
  });

  await it('[CONTROL] userA updates their OWN existing reaction (toggle type) → still ALLOWED', async () => {
    const ctx = env.authenticatedContext('userA');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userA'), {
      type: 'high_five',
    }));
  });

  await it('[CONTROL] userA deletes their OWN existing reaction (the real toggleReaction remove path) → still ALLOWED', async () => {
    const ctx = env.authenticatedContext('userA');
    await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'feed_posts', 'post1', 'reactions', 'userA')));
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
  console.log(`\n=== firestore-fix-write-layer2-batch-a.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('sharedWorkouts creatorId fix', testSharedWorkoutsCreatorIdFix);
wrapSuite('reactions ownership fix', testReactionsOwnershipFix);
