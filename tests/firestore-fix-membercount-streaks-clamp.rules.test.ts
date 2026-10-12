/**
 * LAYER-1 SECURITY FIX — community_groups.memberCount/currentParticipants
 * client-write lockout + streaks clamp (write-layer-5 audit, 12.10.2026).
 * firestore.rules only. NO DEPLOY — David deploys manually after review.
 *
 * Blocking pre-condition (confirmed by David via the Firebase console
 * before this branch was built): `onGroupMemberWrite` is deployed and
 * active (document.written trigger on community_groups/{groupId}/
 * members/{uid}, covers both join AND leave — a delete doesn't orphan
 * the count). Without it, blocking the client write would permanently
 * freeze memberCount; with it, the client write is unnecessary — the
 * trigger (Admin SDK, bypasses these rules) already re-derives the real
 * count from the members subcollection on every membership write.
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
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

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

function dayStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
}

// ============================================================
// memberCount / currentParticipants — community_groups
// ============================================================

async function testMemberCountCreate() {
  console.log('\ncommunity_groups create — memberCount/currentParticipants clamp');

  await it('[CONTROL] legitimate create (memberCount:1, currentParticipants:1 — the only value createGroup ever sends) → ALLOWED', async () => {
    const ctx = env.authenticatedContext('creatorUid');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'g1'), {
      createdBy: 'creatorUid', source: 'user', isOfficial: false, isLocked: false,
      memberCount: 1, currentParticipants: 1, isPublic: true, updatedAt: Timestamp.now(),
    }));
  });

  await it('[DENY] create with a forged starting memberCount (99999) → DENIED', async () => {
    const ctx = env.authenticatedContext('attackerUid');
    await assertFails(setDoc(doc(ctx.firestore(), 'community_groups', 'g2'), {
      createdBy: 'attackerUid', source: 'user', isOfficial: false, isLocked: false,
      memberCount: 99999, currentParticipants: 99999, isPublic: true, updatedAt: Timestamp.now(),
    }));
  });
}

async function testMemberCountUpdate() {
  console.log('\ncommunity_groups update — memberCount/currentParticipants lockout');

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'community_groups', 'gUpdate'), {
      createdBy: 'creatorUid', source: 'user', isOfficial: false, isLocked: false,
      memberCount: 1, currentParticipants: 1, isPublic: true, description: 'original',
      updatedAt: Timestamp.now(),
    });
  });

  await it('[DENY] a complete stranger (not creator, not a member) writes memberCount:99999 via the OLD exploit shape (counters-only update) → DENIED', async () => {
    const ctx = env.authenticatedContext('strangerUid');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', 'gUpdate'), {
      memberCount: 99999, currentParticipants: 99999, updatedAt: Timestamp.now(),
    }));
  });

  await it('[DENY] the CREATOR themselves tries to sneak memberCount:99999 in alongside a legitimate field change → DENIED (closes the broad update path too, not just the narrow one)', async () => {
    const ctx = env.authenticatedContext('creatorUid');
    await assertFails(updateDoc(doc(ctx.firestore(), 'community_groups', 'gUpdate'), {
      description: 'updated description', memberCount: 99999, currentParticipants: 99999,
    }));
  });

  await it('[CONTROL] the creator can still update an unrelated field (description) without touching the counters → ALLOWED', async () => {
    const ctx = env.authenticatedContext('creatorUid');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', 'gUpdate'), {
      description: 'a real edit',
    }));
  });

  await it('[CONTROL] a real join — a different user creates their own members/{uid} subdoc on the public group → ALLOWED (the client-visible half of the join flow; the actual memberCount recompute happens server-side via onGroupMemberWrite, which uses the Admin SDK and bypasses these rules entirely — nothing to prove here under rules-unit-testing beyond "the join write itself still works")', async () => {
    const ctx = env.authenticatedContext('joinerUid');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'community_groups', 'gUpdate', 'members', 'joinerUid'), {
      role: 'member', joinedAt: Timestamp.now(),
    }));
  });

  await it('[CONTROL] isAdmin() bypass is preserved — an admin can still set memberCount directly (authority-manager dashboard override)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'adminUid'), { role: 'admin' });
    });
    const ctx = env.authenticatedContext('adminUid');
    await assertSucceeds(updateDoc(doc(ctx.firestore(), 'community_groups', 'gUpdate'), {
      memberCount: 42, currentParticipants: 42,
    }));
  });
}

// ============================================================
// streaks — currentStreak / longestStreak / lastActivityDate clamp
// ============================================================

async function testStreaksCreate() {
  console.log('\nstreaks create — clamp to the only two real first-sync values');

  await it('[CONTROL] legitimate first-ever create (currentStreak:1, longestStreak:1, today) → ALLOWED', async () => {
    const ctx = env.authenticatedContext('u1');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'u1'), {
      userId: 'u1', currentStreak: 1, longestStreak: 1, lastActivityDate: dayStr(0),
    }));
  });

  await it('[CONTROL] legitimate first-ever create before any threshold crossing (currentStreak:0, longestStreak:0) → ALLOWED', async () => {
    const ctx = env.authenticatedContext('u2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'u2'), {
      userId: 'u2', currentStreak: 0, longestStreak: 0, lastActivityDate: dayStr(0),
    }));
  });

  await it('[DENY] forged create (currentStreak:99999) → DENIED', async () => {
    const ctx = env.authenticatedContext('u3');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'u3'), {
      userId: 'u3', currentStreak: 99999, longestStreak: 99999, lastActivityDate: dayStr(0),
    }));
  });
}

async function seedStreak(uid: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'streaks', uid), { userId: uid, ...data });
  });
}

async function testStreaksUpdate() {
  console.log('\nstreaks update — advance / gap-reset / undo, deny arbitrary values');

  await it('[DENY] owner sets an arbitrary value (99999) directly → DENIED — the exact forgery this clamp exists to close', async () => {
    await seedStreak('owner1', { currentStreak: 3, longestStreak: 5, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('owner1');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner1'), {
      userId: 'owner1', currentStreak: 99999, longestStreak: 99999, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] legitimate +1 advance (yesterday → today, longestStreak already ahead so it stays put) → ALLOWED', async () => {
    await seedStreak('owner2', { currentStreak: 3, longestStreak: 5, lastActivityDate: dayStr(-1) });
    const ctx = env.authenticatedContext('owner2');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner2'), {
      userId: 'owner2', currentStreak: 4, longestStreak: 5, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] legitimate +1 advance that sets a NEW record (longestStreak must rise to match) → ALLOWED', async () => {
    await seedStreak('owner3', { currentStreak: 5, longestStreak: 5, lastActivityDate: dayStr(-1) });
    const ctx = env.authenticatedContext('owner3');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner3'), {
      userId: 'owner3', currentStreak: 6, longestStreak: 6, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[DENY] currentStreak advances by 1 but longestStreak is NOT bumped to match the new record → DENIED (can\'t under-report your own new record, but more importantly proves the longestStreak relationship is actually checked)', async () => {
    await seedStreak('owner3b', { currentStreak: 5, longestStreak: 5, lastActivityDate: dayStr(-1) });
    const ctx = env.authenticatedContext('owner3b');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner3b'), {
      userId: 'owner3b', currentStreak: 6, longestStreak: 5, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] gap reset — a 5-day silence resets currentStreak to 1, longestStreak (already higher) stays unchanged → ALLOWED', async () => {
    await seedStreak('owner4', { currentStreak: 10, longestStreak: 10, lastActivityDate: dayStr(-5) });
    const ctx = env.authenticatedContext('owner4');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner4'), {
      userId: 'owner4', currentStreak: 1, longestStreak: 10, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[DENY] a 2-day gap tries to "advance" (+1) instead of resetting to 1 → DENIED (the gap window is strictly >1 day, not covered by either the advance or the unchanged branch)', async () => {
    await seedStreak('owner5', { currentStreak: 3, longestStreak: 5, lastActivityDate: dayStr(-2) });
    const ctx = env.authenticatedContext('owner5');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner5'), {
      userId: 'owner5', currentStreak: 4, longestStreak: 5, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] unchanged — a routine sync with no streak-relevant change (e.g. steps/floors only) → ALLOWED', async () => {
    await seedStreak('owner6', { currentStreak: 5, longestStreak: 5, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('owner6');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner6'), {
      userId: 'owner6', currentStreak: 5, longestStreak: 5, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] reverseStreakForToday() undo — decrements by 1, longestStreak AND lastActivityDate both stay unchanged (the real write shape, traced from useActivityStore.ts) → ALLOWED', async () => {
    await seedStreak('owner7', { currentStreak: 4, longestStreak: 7, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('owner7');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner7'), {
      userId: 'owner7', currentStreak: 3, longestStreak: 7, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] reverseStreakForToday() undo floors at 0, not negative (currentStreak was 1) → ALLOWED', async () => {
    await seedStreak('owner8', { currentStreak: 1, longestStreak: 3, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('owner8');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'owner8'), {
      userId: 'owner8', currentStreak: 0, longestStreak: 3, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[DENY] undo shape but longestStreak is ALSO changed → DENIED (reversal must leave longestStreak untouched — the real code never decrements it, see useActivityStore.ts\'s explicit comment)', async () => {
    await seedStreak('owner9', { currentStreak: 4, longestStreak: 7, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('owner9');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner9'), {
      userId: 'owner9', currentStreak: 3, longestStreak: 6, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[DENY] future-date anchor — day-diff arithmetic alone would pass (old date is itself already 10 days in the future, new date is exactly old+1), but the absolute request.time anchor independently catches it → DENIED. Proves the anchor is real defense-in-depth against CHAINING forged +1 advances with an ever-receding fake date, not just redundant with the +1 check (old seeded directly via withSecurityRulesDisabled to isolate testing the anchor itself, independent of how a real attacker would have gotten "old" into this state across prior writes)', async () => {
    await seedStreak('owner10', { currentStreak: 3, longestStreak: 3, lastActivityDate: dayStr(10) });
    const ctx = env.authenticatedContext('owner10');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner10'), {
      userId: 'owner10', currentStreak: 4, longestStreak: 4, lastActivityDate: dayStr(11),
    }, { merge: true }));
  });

  await it('[DENY] a stranger (not the doc owner) tries to update someone else\'s streak at all → DENIED', async () => {
    await seedStreak('owner11', { currentStreak: 3, longestStreak: 3, lastActivityDate: dayStr(-1) });
    const ctx = env.authenticatedContext('strangerUid2');
    await assertFails(setDoc(doc(ctx.firestore(), 'streaks', 'owner11'), {
      userId: 'owner11', currentStreak: 4, longestStreak: 4, lastActivityDate: dayStr(0),
    }, { merge: true }));
  });

  await it('[CONTROL] isAdmin() bypass is preserved — an admin can still set an arbitrary streak value directly (manual correction)', async () => {
    await seedStreak('ownerAdminTarget', { currentStreak: 3, longestStreak: 3, lastActivityDate: dayStr(0) });
    const ctx = env.authenticatedContext('adminUid');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'streaks', 'ownerAdminTarget'), {
      userId: 'ownerAdminTarget', currentStreak: 500, longestStreak: 500, lastActivityDate: dayStr(0),
    }, { merge: true }));
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
  console.log(`\n=== firestore-fix-membercount-streaks-clamp.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('memberCount create', testMemberCountCreate);
wrapSuite('memberCount update', testMemberCountUpdate);
wrapSuite('streaks create', testStreaksCreate);
wrapSuite('streaks update', testStreaksUpdate);
