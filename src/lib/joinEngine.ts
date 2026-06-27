/**
 * joinEngine.ts — unified group-join contract (server-side only)
 *
 * Every join entry point resolves through this module, guaranteeing:
 *   1. Target resolved to a verified groupId (never trust client-supplied IDs)
 *   2. User shell complete (progression seeded, never overwrites earned XP)
 *   3. Atomic writes: community_groups/members + user_memberships + users.social.groupIds
 *      + (session joins) attendance RSVP + group_invitations.useCount increment
 *   4. Returns only after batch.commit() — caller may ungate the presence query immediately
 *
 * Callers (thin wrappers):
 *   /api/join/confirm          → target: { type: 'group', inviteCode }
 *   /api/join/session-token    → target: { type: 'session', token, claimedGroupId }
 *   /api/social/group-membership (join) → target: { type: 'direct', groupId }
 *
 * axiom §17: dual-write (social.groupIds + user_memberships) is always atomic.
 * axiom §6: progression fields are server-owned; never overwrite with seeded defaults.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ── Error ──────────────────────────────────────────────────────────────────────

export type JoinEngineErrorCode =
  | 'target-not-found'
  | 'target-expired'
  | 'max-uses-reached'
  | 'token-group-mismatch';

export class JoinEngineError extends Error {
  constructor(
    public readonly code: JoinEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JoinEngineError';
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type JoinTarget =
  /** Full group join via static invite code (e.g. /join/[inviteCode]) */
  | { type: 'group'; inviteCode: string }
  /** Session join via time-limited token (e.g. /session/[token]) */
  | { type: 'session'; token: string; claimedGroupId: string }
  /** Direct groupId — used by the repair guard (/api/social/group-membership join) */
  | { type: 'direct'; groupId: string };

export interface JoinEngineInput {
  target: JoinTarget;
  uid: string;
  /** Used for the member record name; falls back to existing core.name or 'משתמש'. */
  displayName?: string;
  photoURL?: string;
}

export interface JoinResult {
  groupId: string;
  /** Populated for session-token joins (needed by client to start the session). */
  attendanceId?: string;
  userKind: 'new' | 'existing';
  /** false when the member doc already existed before this call. */
  alreadyMember: boolean;
  nextFlow: 'group-home' | 'live-session';
  /** Always true on success. Engine throws on any failure — never returns false. */
  membershipConfirmed: true;
}

// ── Shared progression seed ────────────────────────────────────────────────────
// Identical to the seed in all three existing routes — centralised here.

const DEFAULT_PROGRESSION = {
  globalLevel: 1,
  globalXP: 0,
  coins: 0,
  totalCaloriesBurned: 0,
  hasUnlockedAdvancedStats: false,
  avatarId: 'default',
  unlockedBadges: [] as string[],
  domains: {} as Record<string, unknown>,
  activePrograms: [] as unknown[],
  unlockedBonusExercises: [] as string[],
};

// ── Engine ─────────────────────────────────────────────────────────────────────

export async function joinEngine(input: JoinEngineInput): Promise<JoinResult> {
  const db = getAdminDb();

  // ── Step 1: Resolve target → verified { groupId, attendanceId? } ───────────

  let groupId: string;
  let attendanceId: string | undefined;
  let nextFlow: 'group-home' | 'live-session' = 'group-home';
  let resolvedInviteCode: string | undefined;
  let sessionToken: string | undefined;

  switch (input.target.type) {
    case 'group': {
      const code = input.target.inviteCode.trim().toUpperCase();
      const snap = await db
        .collection('community_groups')
        .where('inviteCode', '==', code)
        .limit(1)
        .get();
      if (snap.empty) {
        throw new JoinEngineError(
          'target-not-found',
          `[joinEngine] invite-code "${input.target.inviteCode}" not found`,
        );
      }
      groupId = snap.docs[0].id;
      resolvedInviteCode = code;
      break;
    }

    case 'session': {
      const invSnap = await db.doc(`group_invitations/${input.target.token}`).get();
      if (!invSnap.exists) {
        throw new JoinEngineError(
          'target-not-found',
          `[joinEngine] session token "${input.target.token}" not found`,
        );
      }
      const inv = invSnap.data() as {
        groupId: string;
        attendanceId: string;
        expiresAt: Timestamp;
        maxUses?: number;
        useCount: number;
      };
      // Security: verify the client-supplied groupId matches the token's groupId.
      if (inv.groupId !== input.target.claimedGroupId) {
        throw new JoinEngineError(
          'token-group-mismatch',
          `[joinEngine] token "${input.target.token}" does not map to groupId "${input.target.claimedGroupId}"`,
        );
      }
      if (inv.expiresAt.toMillis() < Date.now()) {
        throw new JoinEngineError(
          'target-expired',
          `[joinEngine] session token "${input.target.token}" expired`,
        );
      }
      if (inv.maxUses !== undefined && inv.useCount >= inv.maxUses) {
        throw new JoinEngineError(
          'max-uses-reached',
          `[joinEngine] session token "${input.target.token}" max-uses reached`,
        );
      }
      groupId = inv.groupId;
      attendanceId = inv.attendanceId;
      nextFlow = 'live-session';
      sessionToken = input.target.token;
      break;
    }

    case 'direct': {
      // Caller is responsible for validating the groupId is legitimate (e.g. guard
      // repair path where the user is already a member but social.groupIds is stale).
      groupId = input.target.groupId;
      break;
    }
  }

  // ── Step 2: Identify user (new / existing) ─────────────────────────────────

  const userRef = db.doc(`users/${input.uid}`);
  const userSnap = await userRef.get();
  const userData = userSnap.data();
  const userKind: 'new' | 'existing' = userSnap.exists ? 'existing' : 'new';
  // read-before-write: never overwrite earned XP (axiom §6 / noGameIntegrityFieldsChanged)
  const hasProgression = userSnap.exists && Boolean(userData?.progression);

  // Resolve member display name: provided > existing core.name > placeholder
  const memberName = (
    input.displayName?.trim() ||
    (userData?.core?.name as string | undefined)?.trim() ||
    'משתמש'
  );

  // ── Step 3: Check existing membership (guard for joinedAt + memberCount) ───

  const memberRef = db
    .collection('community_groups')
    .doc(groupId)
    .collection('members')
    .doc(input.uid);
  const memberSnap = await memberRef.get();
  const alreadyMember = memberSnap.exists;

  // ── Step 4: Atomic triple-write ────────────────────────────────────────────

  const batch = db.batch();

  // 4a. Member record — idempotent (merge:true preserves joinedAt on re-join)
  batch.set(
    memberRef,
    {
      uid: input.uid,
      name: memberName,
      role: 'member',
      ...(resolvedInviteCode ? { inviteCode: resolvedInviteCode } : {}),
      ...(alreadyMember ? {} : { joinedAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  // 4b. user_memberships mirror — presence-read gate (axiom §17)
  batch.set(
    db.doc(`user_memberships/${input.uid}`),
    {
      groupIds: FieldValue.arrayUnion(groupId),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // 4c. users/{uid}.social.groupIds + conditional progression seed
  // mergeFields restricts the set() to only these paths — other fields are untouched.
  const userDocPayload: Record<string, unknown> = {
    social: { groupIds: FieldValue.arrayUnion(groupId) },
    updatedAt: FieldValue.serverTimestamp(),
  };
  const mergeFields = ['social.groupIds', 'updatedAt'];

  if (!hasProgression) {
    userDocPayload.progression = DEFAULT_PROGRESSION;
    mergeFields.push('progression');
  }

  batch.set(userRef, userDocPayload, { mergeFields });

  // 4d. Session-token joins: attendance RSVP + useCount increment.
  // These were previously client-side writes in consumeSessionInvitation, which created
  // a partial-write window: if step 2 (attendance) threw, user_memberships was never
  // written but joinViaDeepLink + setMembershipReady still fired → PERMISSION-DENIED on
  // every presence read (memberGroupIds(guest) returned []). Moving both here makes the
  // entire join atomic — axiom §17: no presence query ungate until commit() returns.
  if (sessionToken && attendanceId) {
    const attendeeProfile: Record<string, unknown> = { name: memberName, joinedViaToken: sessionToken };
    if (input.photoURL) attendeeProfile.photoURL = input.photoURL;

    batch.update(
      db.doc(`community_groups/${groupId}/attendance/${attendanceId}`),
      {
        attendees: FieldValue.arrayUnion(input.uid),
        [`attendeeProfiles.${input.uid}`]: attendeeProfile,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );

    batch.update(
      db.doc(`group_invitations/${sessionToken}`),
      { useCount: FieldValue.increment(1) },
    );
  }

  // ── Step 5: Commit — throws on failure (caller must not swallow) ───────────

  await batch.commit();

  // ── Step 6: Return (membershipConfirmed: true is the signal to ungate presence) ─

  return {
    groupId,
    attendanceId,
    userKind,
    alreadyMember,
    nextFlow,
    membershipConfirmed: true,
  };
}
