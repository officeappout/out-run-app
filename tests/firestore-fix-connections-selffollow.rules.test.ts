/**
 * LAYER-1 SECURITY FIX #1 — connections/{userId} self-follow (10.10.2026).
 * firestore.rules only — no application code touched.
 *
 * Root-cause fix for the presence squad-mode live-GPS leak chain from
 * the adversarial data-layer audit: self-insertion (a non-owner adding
 * their OWN uid to someone else's followers with zero interaction from
 * them) is now closed, both the update-path and the create-path variant
 * of the same exploit. Unfollow (removing your own uid) is UNCHANGED —
 * it never required anyone's consent.
 *
 * Layer 2/3 (a real request+approval mechanism for connections) is
 * explicitly OUT OF SCOPE for this change, per instruction — until it
 * ships, no client-side path exists to add a new follower at all. That
 * tradeoff (temporarily no "Follow" feature over a live GPS leak) is a
 * deliberate instruction, not an oversight.
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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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
    await setDoc(doc(db, 'userAge', 'userA'), { ageGroup: 'adult' });
    await setDoc(doc(db, 'userAge', 'userB'), { ageGroup: 'adult' });

    // An EXISTING connections/userA doc, no followers yet — for the
    // update-path self-follow deny test.
    await setDoc(doc(db, 'connections', 'userA'), { followers: [], following: [], updatedAt: new Date() });
  });
}

async function testConnectionsSelfFollowFix() {
  console.log('\nFix #1 — connections/{userId}: self-follow closed, unfollow + accepted-follow-read unaffected');

  await it('[DENY] userB self-inserts into EXISTING connections/userA.followers (update-path) → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(updateDoc(doc(ctx.firestore(), 'connections', 'userA'), {
      followers: ['userB'], updatedAt: new Date(),
    }));
  });

  await it('[DENY] userB self-inserts via CREATE on a connections/userC doc that does not exist yet (create-path variant of the same exploit) → now DENIED', async () => {
    const ctx = env.authenticatedContext('userB');
    await assertFails(setDoc(doc(ctx.firestore(), 'connections', 'userC'), {
      followers: ['userB'], following: [], updatedAt: new Date(),
    }));
  });

  await it('[CONTROL] a follower who is ALREADY recorded (however that record came to exist — e.g. a future Admin-SDK accept-flow) can still remove themselves (unfollow) → ALLOWED, unchanged', async () => {
    await env.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'connections', 'userA'), {
        followers: ['userB'], following: [], updatedAt: new Date(),
      });
    });
    const ctx = env.authenticatedContext('userB');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'connections', 'userA'), {
      followers: [], updatedAt: new Date(),
    }));
  });

  await it('[CONTROL] presence squad-mode read for an ALREADY-accepted follower still works — this fix only closes the WRITE-side self-insertion, not the READ-side consequence of a real, already-recorded follow', async () => {
    await env.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'connections', 'userA'), {
        followers: ['userB'], following: [], updatedAt: new Date(),
      });
      await setDoc(doc(adminCtx.firestore(), 'presence', 'userA'), {
        uid: 'userA', name: 'A', ageGroup: 'adult', mode: 'squad', lat: 32.08, lng: 34.78, updatedAt: new Date(),
      });
    });
    const ctx = env.authenticatedContext('userB');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'presence', 'userA')));
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
  console.log(`\n=== firestore-fix-connections-selffollow.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('connections self-follow fix', testConnectionsSelfFollowFix);
