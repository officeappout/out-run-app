/**
 * consumePendingInvites — ONE consumer for every pending invite a deep link
 * left in localStorage, used by every sign-in path (landing Google / Apple,
 * gateway, quick signup, express identity) behind enable_group_fixes_v1.
 *
 *   pending_invite_code    (/join/[code], native join links) → /api/join/confirm
 *   pending_session_token  (/session/[token])                → /api/join/session-token
 *   pending_group_id       (legacy group deep links)         → joinGroup
 *
 * Fixes vs the per-path copies (group audit P1-8):
 *  - an in-flight guard: two auth listeners firing together (onAuthStateChange
 *    + redirectAfterAuth after Google sign-in) share ONE run instead of the
 *    second one finding the keys already cleared and dropping the invite;
 *  - a key is removed only once its join has an answer (success or a definite
 *    rejection), never before the request;
 *  - every success lands through resolveJoinLanding (the group page by id).
 *
 * Returns the URL to navigate to, or null when nothing was pending.
 */
import { auth } from '@/lib/firebase';
import { resolveJoinLanding } from '@/lib/resolveJoinLanding';
import { joinGroup } from '@/features/arena/services/group.service';
import { consumeSessionInvitation } from '@/features/arena/services/group-invitation.service';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';

export interface PendingInviteUser {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
}

const FALLBACK_NAME = 'משתמש'; // i18n-allow-hebrew: data — fallback member name written to Firestore

const KEYS = {
  code: 'pending_invite_code',
  codeGroupName: 'pending_invite_group_name',
  session: 'pending_session_token',
  groupId: 'pending_group_id',
  runInvite: 'pending_run_invite',
} as const;

let inFlight: Promise<string | null> | null = null;

export function hasPendingInvite(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(localStorage.getItem(KEYS.code) || localStorage.getItem(KEYS.session) || localStorage.getItem(KEYS.groupId));
}

export function consumePendingInvites(user: PendingInviteUser): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = run(user).finally(() => { inFlight = null; });
  return inFlight;
}

/** Test seam: forget a stuck in-flight run. */
export function __resetPendingInvitesForTest(): void { inFlight = null; }

async function run(user: PendingInviteUser): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const code = localStorage.getItem(KEYS.code);
  if (code) return consumeCode(code);
  const token = localStorage.getItem(KEYS.session);
  if (token) return consumeSession(token, user);
  const groupId = localStorage.getItem(KEYS.groupId);
  if (groupId) return consumeGroupId(groupId, user);
  return null;
}

async function consumeCode(code: string): Promise<string> {
  const retry = `/join/${encodeURIComponent(code)}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return retry; // keys kept — the join page retries after sign-in
    const res = await fetch('/api/join/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ inviteCode: code }),
    });
    localStorage.removeItem(KEYS.code);
    localStorage.removeItem(KEYS.codeGroupName);
    localStorage.removeItem(KEYS.groupId);
    if (!res.ok) return retry; // the join page shows "invalid link" / lets the user retry
    const { groupId } = (await res.json()) as { groupId: string };
    return resolveJoinLanding(groupId);
  } catch (err) {
    console.error('[consumePendingInvites] invite code failed:', err);
    return retry;
  }
}

async function consumeSession(token: string, user: PendingInviteUser): Promise<string> {
  try {
    const { groupId, attendanceId, source, activityType } = await consumeSessionInvitation(token, user.uid, {
      name: user.displayName || FALLBACK_NAME,
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    });
    localStorage.removeItem(KEYS.session);
    useSharedSession.getState().joinViaDeepLink(groupId, attendanceId, [], {}, '');
    useSharedSession.getState().setMembershipReady();
    if (source === 'run-invite' && activityType) {
      localStorage.setItem(KEYS.runInvite, JSON.stringify({ token, groupId, attendanceId, activityType, source }));
      return `/map?openRun=${activityType}`;
    }
    return resolveJoinLanding(groupId, { joined: false });
  } catch (err) {
    console.error('[consumePendingInvites] session token failed:', err);
    localStorage.removeItem(KEYS.session);
    // The session page shows the real reason (expired / invalid) and a retry.
    return `/session/${encodeURIComponent(token)}`;
  }
}

async function consumeGroupId(groupId: string, user: PendingInviteUser): Promise<string> {
  try {
    await joinGroup(groupId, user.uid, user.displayName || FALLBACK_NAME);
    localStorage.removeItem(KEYS.groupId);
    return resolveJoinLanding(groupId);
  } catch (err) {
    console.error('[consumePendingInvites] group join failed:', err);
    localStorage.removeItem(KEYS.groupId);
    // Open the group anyway — its drawer has the join button.
    return resolveJoinLanding(groupId, { joined: false });
  }
}
