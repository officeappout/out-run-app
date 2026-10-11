/**
 * LAYER-2 SECURITY FIX — BATCH B (attendance), 10.10.2026.
 * firestore.rules only, no application code touched, NO DEPLOY —
 * this batch has its own explicit approval gate on the rule's exact
 * shape before anything is pushed, per instruction.
 *
 * Contract:
 *   (a) group admin (or OUT admin) — full write, any shape.
 *   (b) group member, non-admin — RSVP only: add/remove EXACTLY their
 *       own uid from attendees OR waitlist (one array per write,
 *       set-equality, same shape as connections' self-toggle fix).
 *       currentCount locked to the attendees delta. attendeeProfiles/
 *       waitlistProfiles restricted to the caller's own map key.
 *   (c) non-member — denied by omission.
 *
 * REQUIRED control tests (per instruction, not deny-only): admin sets
 * an arbitrary list (allowed); a member adds themselves via the
 * real arrayUnion-shaped write (allowed — proves booking isn't broken);
 * a non-member write (denied); a member overwriting someone ELSE's uid
 * (denied).
 *
 * ALSO INCLUDED — a regression guard for a tension found while verifying
 * this against the real booking.service.ts code, RESOLVED 11.10.2026:
 * cancelBooking's waitlist auto-promotion used to have the CANCELING
 * member's own write move a DIFFERENT uid (the next person in the
 * waitlist queue) from waitlist into attendees, in the same update. No
 * branch in this contract admits a write that touches a uid other than
 * the caller's own (by design) — so that promotion moved server-side
 * (POST /api/social/promote-waitlist, Admin SDK). The case below proves
 * the OLD client-side shape stays denied, as a regression guard.
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

const GROUP = 'groupA';

async function seedFreshSession(sessionId: string, attendees: string[], currentCount: number, extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', sessionId), {
      groupId: GROUP, date: '2026-11-01', time: '18:00', attendees, currentCount, ...extra,
    });
  });
}

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'adminUser'), { core: { isSuperAdmin: true } });
    await setDoc(doc(db, 'community_groups', GROUP), { name: 'Group A', createdBy: 'ownerUid', isPublic: false });
    // memberA, memberB, memberC are real members; outsider is NOT.
    await setDoc(doc(db, 'community_groups', GROUP, 'members', 'memberA'), { uid: 'memberA', role: 'member' });
    await setDoc(doc(db, 'community_groups', GROUP, 'members', 'memberB'), { uid: 'memberB', role: 'member' });
    await setDoc(doc(db, 'community_groups', GROUP, 'members', 'memberC'), { uid: 'memberC', role: 'member' });
  });
}

async function testAdminFullWrite() {
  console.log('\n(a) group admin — full write, any shape');

  await it('[CONTROL] admin sets an arbitrary attendees list directly (not a self-toggle shape) → ALLOWED', async () => {
    await seedFreshSession('sessionAdmin1', ['memberA'], 1);
    const ctx = env.authenticatedContext('adminUser');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'sessionAdmin1'), {
      attendees: ['memberB', 'memberC'], currentCount: 2,
    }));
  });
}

async function testMemberSelfToggleOnly() {
  console.log('\n(b) group member — self-toggle only on attendees/waitlist');

  await it('[CONTROL] member creates the FIRST RSVP for a new session (the real first-booker shape) → ALLOWED', async () => {
    const ctx = env.authenticatedContext('memberA');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'sessionNew1'), {
      groupId: GROUP, date: '2026-11-02', time: '18:00', attendees: ['memberA'], currentCount: 1,
    }));
  });

  await it('[CONTROL] member adds themself via the real arrayUnion-shaped update (attendees + currentCount together) → ALLOWED, proves booking isn\'t broken', async () => {
    await seedFreshSession('session1', ['memberA'], 1);
    const ctx = env.authenticatedContext('memberB');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session1'), {
      attendees: ['memberA', 'memberB'], currentCount: 2,
    }));
  });

  await it('[CONTROL] member removes themself (cancel) — attendees shrinks, currentCount -1 → ALLOWED', async () => {
    await seedFreshSession('session2', ['memberA', 'memberB'], 2);
    const ctx = env.authenticatedContext('memberB');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session2'), {
      attendees: ['memberA'], currentCount: 1,
    }));
  });

  await it('[CONTROL] member joins the waitlist (attendees/currentCount unchanged) → ALLOWED', async () => {
    await seedFreshSession('session3', ['memberA'], 1, { waitlist: [] });
    const ctx = env.authenticatedContext('memberB');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session3'), {
      waitlist: ['memberB'],
    }));
  });

  await it('[DENY] non-member writes to the session at all → DENIED', async () => {
    await seedFreshSession('session4', ['memberA'], 1);
    const ctx = env.authenticatedContext('outsider');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session4'), {
      attendees: ['memberA', 'outsider'], currentCount: 2,
    }));
  });

  await it('[DENY] member adds a DIFFERENT uid (not their own) to attendees → DENIED', async () => {
    await seedFreshSession('session5', ['memberA'], 1);
    const ctx = env.authenticatedContext('memberB');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session5'), {
      attendees: ['memberA', 'memberC'], currentCount: 2,
    }));
  });

  await it('[DENY] member overwrites someone ELSE\'s already-attending uid out of the list → DENIED', async () => {
    await seedFreshSession('session6', ['memberA', 'memberB'], 2);
    const ctx = env.authenticatedContext('memberC');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session6'), {
      attendees: ['memberC'], currentCount: 1,
    }));
  });

  await it('[DENY] member forges currentCount without a matching attendees change → DENIED (currentCount not independently forgeable)', async () => {
    await seedFreshSession('session7', ['memberA'], 1);
    const ctx = env.authenticatedContext('memberA');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session7'), {
      currentCount: 9999,
    }));
  });

  await it('[DENY] member\'s own valid attendees self-add also tries to sneak a phase-field change → DENIED (phase fields stay admin-only even inside an otherwise-legitimate RSVP)', async () => {
    await seedFreshSession('session8', ['memberA'], 1);
    const ctx = env.authenticatedContext('memberB');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session8'), {
      attendees: ['memberA', 'memberB'], currentCount: 2, sessionPhase: 'active',
    }));
  });

  await it('[DENY] first-RSVP create with someone ELSE already listed alongside the caller → DENIED', async () => {
    const ctx = env.authenticatedContext('memberA');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'sessionForged1'), {
      groupId: GROUP, date: '2026-11-03', time: '18:00', attendees: ['memberA', 'memberB'], currentCount: 2,
    }));
  });

  await it('[DENY] member tries to write another member\'s profile key under attendeeProfiles → DENIED (profile map restricted to caller\'s own key)', async () => {
    await seedFreshSession('session9', ['memberA', 'memberB'], 2, { attendeeProfiles: { memberA: { name: 'A' }, memberB: { name: 'B' } } });
    const ctx = env.authenticatedContext('memberA');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'session9'), {
      attendeeProfiles: { memberA: { name: 'A' }, memberB: { name: 'FORGED' } },
    }));
  });
}

async function testKnownTensionWaitlistPromotion() {
  console.log('\nRegression guard — client SDK can no longer cross-promote the waitlist (moved server-side, 11.10.2026)');

  await it('[REGRESSION GUARD, RED by design] a canceling member\'s own CLIENT-SDK write also promoting a DIFFERENT uid from waitlist to attendees, in one update (the OLD booking.service.ts shape, before the fix) → still DENIED under this contract. Real promotion now happens via POST /api/social/promote-waitlist (Admin SDK, bypasses rules by design) — this test exists to catch a regression if anyone ever re-adds a client-side cross-uid write here.', async () => {
    await seedFreshSession('sessionPromo1', ['memberA'], 1, { waitlist: ['memberB'], waitlistProfiles: { memberB: { name: 'B' } } });
    const ctx = env.authenticatedContext('memberA');
    // The exact real-code shape: remove self from attendees AND promote
    // memberB from waitlist to attendees, in ONE update call.
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', GROUP, 'attendance', 'sessionPromo1'), {
      attendees: ['memberB'],
      waitlist: [],
      currentCount: 1,
      waitlistProfiles: {},
      attendeeProfiles: { memberB: { name: 'B' } },
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
  console.log(`\n=== firestore-fix-write-layer2-batch-b-attendance.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('admin full write', testAdminFullWrite);
wrapSuite('member self-toggle only', testMemberSelfToggleOnly);
wrapSuite('known tension — waitlist auto-promotion', testKnownTensionWaitlistPromotion);
