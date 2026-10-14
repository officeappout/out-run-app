/**
 * joinEngine — session-token host-membership gate (write-layer-3 audit,
 * live-location exposure, HIGH), 11.10.2026.
 *
 * Confirmed end-to-end exploit chain before this fix: any authenticated
 * user could self-create a group_invitations doc naming themselves
 * hostUid for ANY groupId (firestore.rules' create rule only checked
 * hostUid == self, never that the caller has any relationship to that
 * group), then consume their own forged token via
 * POST /api/join/session-token → joinEngine, which never verified hostUid
 * was a real member/admin of groupId either. Once "joined" via the real
 * atomic triple-write, group-mode presence
 * (memberGroupIds().hasAny(audienceGroupIds)) and that group's attendance
 * docs become readable — live GPS + name of any real member broadcasting
 * to that group, not just stored content. Scoping confirmed and approved
 * by David as HIGH, exploitable today, before this fix was written.
 *
 * This is THE real gate — joinEngine runs server-side (Admin SDK) and is
 * the only thing that can stop run-session/route.ts's own Admin-SDK writer
 * too (firestore.rules' matching create-time check, added alongside this,
 * is defense-in-depth only and cannot cover Admin SDK callers by design).
 *
 * getAdminDb/getAdminAuth are mocked (not called by joinEngine in this
 * test's path at all for Auth; getAdminDb IS called internally by
 * joinEngine, so the mock returns a REAL Firestore client connected to the
 * isolated emulator — not a fake). This sidesteps '@/lib/firebase-admin's
 * `import 'server-only'` guard, which throws unconditionally outside
 * Next's server-component bundler (confirmed empirically this engagement,
 * same reason create-unit.emulator.test.ts needs the same mock shape).
 *
 * Run: isolated emulator on 127.0.0.1:8089 (NOT the shared 8080 instance
 * another concurrent session may be using) — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const PROJECT_ID = 'appout-1-joinengine-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8089';

let emulatorDb: import('firebase-admin/firestore').Firestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => emulatorDb,
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from joinEngine'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { joinEngine, JoinEngineError } from '../joinEngine';

let app: App;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
  }
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `joinengine-hostuid-emulator-test-${Date.now()}`);
  emulatorDb = getFirestore(app);
}, 20000);

beforeEach(async () => {
  await clearEmulator();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

const GROUP_ID = 'lockedGroup1';
const ATTENDANCE_ID = '2026-11-20_18-00';
const FUTURE = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);

async function seedGroupAndAttendance() {
  await emulatorDb.doc(`community_groups/${GROUP_ID}`).set({
    name: 'Locked Institutional Group', isLocked: true, isPublic: false, createdBy: 'realAdminUid',
  });
  await emulatorDb.doc(`community_groups/${GROUP_ID}/attendance/${ATTENDANCE_ID}`).set({
    groupId: GROUP_ID, date: '2026-11-20', time: '18:00', attendees: [], currentCount: 0,
  });
}

describe('joinEngine — session-token host-membership gate (real Firestore)', () => {
  it('[DENY] hostUid has NO members/{uid} doc in groupId at all (the forged-invitation shape) → throws JoinEngineError(host-not-member), nothing written', async () => {
    await seedGroupAndAttendance();
    const token = 'forgedToken1';
    await emulatorDb.doc(`group_invitations/${token}`).set({
      token, groupId: GROUP_ID, attendanceId: ATTENDANCE_ID,
      hostUid: 'attackerUid', // never a real member of GROUP_ID
      expiresAt: FUTURE, useCount: 0,
    });

    await expect(
      joinEngine({
        target: { type: 'session', token, claimedGroupId: GROUP_ID },
        uid: 'attackerUid',
        displayName: 'Attacker',
      }),
    ).rejects.toThrow(JoinEngineError);

    try {
      await joinEngine({
        target: { type: 'session', token, claimedGroupId: GROUP_ID },
        uid: 'attackerUid',
        displayName: 'Attacker',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(JoinEngineError);
      expect((e as InstanceType<typeof JoinEngineError>).code).toBe('host-not-member');
    }

    const memberSnap = await emulatorDb.doc(`community_groups/${GROUP_ID}/members/attackerUid`).get();
    expect(memberSnap.exists).toBe(false);
    const membershipSnap = await emulatorDb.doc('user_memberships/attackerUid').get();
    expect(membershipSnap.exists).toBe(false);
  });

  it('[CONTROL] hostUid IS a real member of groupId (the legitimate invite shape) → joins successfully, real atomic triple-write happens, useCount increments', async () => {
    await seedGroupAndAttendance();
    await emulatorDb.doc(`community_groups/${GROUP_ID}/members/realHostUid`).set({
      uid: 'realHostUid', name: 'Real Host', role: 'admin',
    });
    const token = 'legitToken1';
    await emulatorDb.doc(`group_invitations/${token}`).set({
      token, groupId: GROUP_ID, attendanceId: ATTENDANCE_ID,
      hostUid: 'realHostUid', expiresAt: FUTURE, useCount: 0,
    });

    const result = await joinEngine({
      target: { type: 'session', token, claimedGroupId: GROUP_ID },
      uid: 'realJoinerUid',
      displayName: 'Real Joiner',
    });

    expect(result.membershipConfirmed).toBe(true);
    expect(result.groupId).toBe(GROUP_ID);
    expect(result.nextFlow).toBe('live-session');

    const memberSnap = await emulatorDb.doc(`community_groups/${GROUP_ID}/members/realJoinerUid`).get();
    expect(memberSnap.exists).toBe(true);
    const membershipSnap = await emulatorDb.doc('user_memberships/realJoinerUid').get();
    expect(membershipSnap.data()?.groupIds).toContain(GROUP_ID);
    const userSnap = await emulatorDb.doc('users/realJoinerUid').get();
    expect(userSnap.data()?.social?.groupIds).toContain(GROUP_ID);
    const attendanceSnap = await emulatorDb.doc(`community_groups/${GROUP_ID}/attendance/${ATTENDANCE_ID}`).get();
    expect(attendanceSnap.data()?.attendees).toContain('realJoinerUid');
    const invSnap = await emulatorDb.doc(`group_invitations/${token}`).get();
    expect(invSnap.data()?.useCount).toBe(1);
  });

  it('[CONTROL] hostUid is a real member with role "member" (not "admin") → still passes the gate (existence of the members doc is what matters, not role)', async () => {
    await seedGroupAndAttendance();
    await emulatorDb.doc(`community_groups/${GROUP_ID}/members/plainMemberHostUid`).set({
      uid: 'plainMemberHostUid', name: 'Plain Member Host', role: 'member',
    });
    const token = 'legitToken2';
    await emulatorDb.doc(`group_invitations/${token}`).set({
      token, groupId: GROUP_ID, attendanceId: ATTENDANCE_ID,
      hostUid: 'plainMemberHostUid', expiresAt: FUTURE, useCount: 0,
    });

    const result = await joinEngine({
      target: { type: 'session', token, claimedGroupId: GROUP_ID },
      uid: 'anotherJoinerUid',
      displayName: 'Another Joiner',
    });

    expect(result.membershipConfirmed).toBe(true);
  });
});

// 14.10.2026 — quarantined (moderation-removed) groups are never joinable.
describe('joinEngine — quarantined group (real Firestore)', () => {
  it('[DENY] direct join into a moderationState:"removed" group → throws JoinEngineError(target-not-found), no member / mirror written', async () => {
    await emulatorDb.doc('community_groups/removedGrp').set({
      name: 'Removed', isActive: false, moderationState: 'removed', createdBy: 'someAdmin',
    });
    await expect(
      joinEngine({ target: { type: 'direct', groupId: 'removedGrp' }, uid: 'joinerUid', displayName: 'Joiner' }),
    ).rejects.toMatchObject({ name: 'JoinEngineError', code: 'target-not-found' });
    expect((await emulatorDb.doc('community_groups/removedGrp/members/joinerUid').get()).exists).toBe(false);
    expect((await emulatorDb.doc('user_memberships/joinerUid').get()).exists).toBe(false);
  });

  it('[CONTROL] the SAME join into an ordinary (non-removed) group still succeeds', async () => {
    await emulatorDb.doc('community_groups/okGrp').set({ name: 'Ok', isActive: true, createdBy: 'someAdmin' });
    await joinEngine({ target: { type: 'direct', groupId: 'okGrp' }, uid: 'joinerUid', displayName: 'Joiner' });
    expect((await emulatorDb.doc('community_groups/okGrp/members/joinerUid').get()).exists).toBe(true);
    expect((await emulatorDb.doc('user_memberships/joinerUid').get()).exists).toBe(true);
  });
});
