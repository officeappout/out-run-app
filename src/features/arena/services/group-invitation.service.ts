/**
 * group-invitation.service.ts
 *
 * Phase G v1 — session-specific time-limited join tokens.
 * Stored in the top-level `group_invitations/{token}` collection.
 *
 * Distinct from the static `community_groups.inviteCode` field (permanent
 * group membership). A session invitation ties a token to a specific
 * attendance doc and expires after the session.
 */

import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupInvitationDoc {
  token: string;
  groupId: string;
  attendanceId: string;
  hostUid: string;
  sessionDate: string;
  sessionTime: string;
  groupName: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  maxUses?: number;
  useCount: number;
  source?: 'run-invite';
  activityType?: 'running' | 'walking';
}

export interface SessionMeta {
  sessionDate: string;
  sessionTime: string;
  groupName: string;
}

export type ValidationResult =
  | { valid: true; doc: GroupInvitationDoc }
  | { valid: false; reason: 'not_found' | 'expired' | 'max_uses_reached' };

// ─── Constants ─────────────────────────────────────────────────────────────────

const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours after session start

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = 'si_';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Service functions ─────────────────────────────────────────────────────────

/**
 * Creates a session invitation token. Called when the host opens the lobby.
 * Returns the token and the full shareable URL.
 */
export async function createSessionInvitation(
  groupId: string,
  attendanceId: string,
  hostUid: string,
  meta: SessionMeta,
): Promise<{ token: string; url: string }> {
  const token = generateToken();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + EXPIRY_MS);

  const invitationDoc: GroupInvitationDoc = {
    token,
    groupId,
    attendanceId,
    hostUid,
    sessionDate: meta.sessionDate,
    sessionTime: meta.sessionTime,
    groupName: meta.groupName,
    createdAt: now,
    expiresAt,
    useCount: 0,
  };

  await setDoc(doc(db, 'group_invitations', token), invitationDoc);

  return {
    token,
    url: `${APP_CONFIG_LINKS.WEB_BASE_URL}/session/${token}`,
  };
}

/**
 * Validates a token without consuming it.
 * Called by the /session/[token] landing page before showing the join UI.
 */
export async function validateSessionInvitation(token: string): Promise<ValidationResult> {
  const snap = await getDoc(doc(db, 'group_invitations', token));
  if (!snap.exists()) return { valid: false, reason: 'not_found' };

  const data = snap.data() as GroupInvitationDoc;
  if (data.expiresAt.toMillis() < Timestamp.now().toMillis()) {
    return { valid: false, reason: 'expired' };
  }
  if (data.maxUses !== undefined && data.useCount >= data.maxUses) {
    return { valid: false, reason: 'max_uses_reached' };
  }

  return { valid: true, doc: data };
}

/**
 * Consumes a token: increments useCount, writes the user to attendance.
 * Must be called only after validateSessionInvitation returns valid.
 */
export async function consumeSessionInvitation(
  token: string,
  uid: string,
  userProfile: { name: string; photoURL?: string },
): Promise<{ groupId: string; attendanceId: string; source?: 'run-invite'; activityType?: 'running' | 'walking' }> {
  const snap = await getDoc(doc(db, 'group_invitations', token));
  if (!snap.exists()) throw new Error('invitation-not-found');

  const data = snap.data() as GroupInvitationDoc;

  if (data.expiresAt.toMillis() < Timestamp.now().toMillis()) {
    throw new Error('invitation-expired');
  }
  if (data.maxUses !== undefined && data.useCount >= data.maxUses) {
    throw new Error('invitation-max-uses-reached');
  }

  const { groupId, attendanceId, source, activityType } = data;

  // /api/join/session-token → joinEngine writes ALL four docs atomically (Admin SDK batch):
  //   1. community_groups/{groupId}/members/{uid}  — member record
  //   2. user_memberships/{uid}                    — presence-read gate (§17)
  //   3. users/{uid}.social.groupIds               — client-read denormalized array
  //   4. attendance/{attendanceId}                 — attendee RSVP + attendeeProfiles
  //   + group_invitations/{token}.useCount         — increment
  //
  // BLOCKING: joinViaDeepLink (sets useSharedSession.groupId → presence query opens)
  // must NOT run until HTTP 200 confirms the batch committed. Without user_memberships,
  // memberGroupIds(guest)=[] → PERMISSION-DENIED on every presence read.
  //
  // Failure modes:
  //   • No auth token   → throw (never happens for authenticated users)
  //   • Network error   → fetch throws → re-throw (logged below)
  //   • HTTP !ok (5xx)  → log body for server-side diagnosis → throw
  //   • HTTP 200        → all 4+1 writes confirmed → fall through
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) {
    console.error('[consumeSessionInvitation] no auth token — cannot write user_memberships for', uid);
    throw new Error('session-token-no-auth');
  }

  let sessionTokenRes: Response;
  try {
    sessionTokenRes = await fetch('/api/join/session-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, groupId }),
    });
  } catch (networkErr) {
    console.error('[consumeSessionInvitation] session-token network failure — user_memberships NOT written:', networkErr);
    throw networkErr;
  }

  if (!sessionTokenRes.ok) {
    let body = '(unreadable)';
    try { body = await sessionTokenRes.text(); } catch {}
    console.error(
      `[consumeSessionInvitation] session-token HTTP ${sessionTokenRes.status} — user_memberships NOT written. ` +
      `This is a server-side bug if status is 5xx. Body: ${body}`,
    );
    throw new Error(`session-token-server-error-${sessionTokenRes.status}`);
  }

  return { groupId, attendanceId, source, activityType };
}
