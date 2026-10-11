/**
 * LAYER-1 SECURITY FIX — group_invitations create, hostUid-membership gate
 * (write-layer-3 adversarial audit, live-location exposure, HIGH), 11.10.2026.
 * firestore.rules only, NO DEPLOY.
 *
 * Defense-in-depth only — the REAL gate is joinEngine.ts's own check at
 * CONSUME time (see src/lib/__tests__/joinEngine.hostuid-escalation.emulator.test.ts),
 * since this rule cannot stop an Admin-SDK writer (run-session/route.ts) by
 * design. This rule stops the CLIENT-SDK create path specifically:
 * group-invitation.service.ts's createSessionInvitation, the only real
 * client-SDK writer of this collection.
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
import { doc, setDoc, Timestamp } from 'firebase/firestore';

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

const GROUP_ID = 'lockedGroup1';

async function setup() {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'community_groups', GROUP_ID), {
      name: 'Locked Institutional Group', isLocked: true, isPublic: false, createdBy: 'ownerUid',
    });
    // realMemberUid IS a real member; attackerUid is NOT.
    await setDoc(doc(db, 'community_groups', GROUP_ID, 'members', 'realMemberUid'), {
      uid: 'realMemberUid', name: 'Real Member', role: 'member',
    });
  });
}

function invitationPayload(overrides: Record<string, unknown> = {}) {
  return {
    groupId: GROUP_ID,
    attendanceId: '2026-11-20_18-00',
    hostUid: 'realMemberUid',
    sessionDate: '2026-11-20',
    sessionTime: '18:00',
    groupName: 'Locked Institutional Group',
    createdAt: new Date(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
    useCount: 0,
    ...overrides,
  };
}

async function testHostMustBeMember() {
  console.log('\ngroup_invitations create — hostUid must be a real member/admin of groupId');

  await it('[CONTROL] a real member of the group creates an invitation naming themselves host → ALLOWED (the legitimate flow still works)', async () => {
    const ctx = env.authenticatedContext('realMemberUid');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'group_invitations', 'legitToken1'), invitationPayload()));
  });

  await it('[DENY] an authenticated user with NO members/{uid} doc in the target group creates a self-hosted invitation for it → DENIED (the forged-invitation shape that let an attacker self-join a locked group)', async () => {
    const ctx = env.authenticatedContext('attackerUid');
    await assertFails(setDoc(doc(ctx.firestore(), 'group_invitations', 'forgedToken1'), invitationPayload({ hostUid: 'attackerUid' })));
  });

  await it('[DENY] hostUid matches the caller but the claimed groupId does not exist at all → DENIED (exists() on a non-existent members subcollection path is false, not an error)', async () => {
    const ctx = env.authenticatedContext('attackerUid');
    await assertFails(setDoc(doc(ctx.firestore(), 'group_invitations', 'forgedToken2'), invitationPayload({
      hostUid: 'attackerUid', groupId: 'groupThatDoesNotExist',
    })));
  });

  await it('[DENY] still blocked even when the caller is honest about hostUid==self but simply isn\'t a member — the pre-existing hostUid==self check alone was never sufficient', async () => {
    const ctx = env.authenticatedContext('anotherNonMemberUid');
    await assertFails(setDoc(doc(ctx.firestore(), 'group_invitations', 'forgedToken3'), invitationPayload({ hostUid: 'anotherNonMemberUid' })));
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
  console.log(`\n=== firestore-fix-group-invitations-hostuid.rules.test.ts: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failed:', failures.join(', '));
  if (env) await env.cleanup();
});

wrapSuite('host must be member', testHostMustBeMember);
