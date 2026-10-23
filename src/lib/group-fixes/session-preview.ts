/**
 * Public preview of a session invitation (group_invitations/{token}) for
 * /session/[token] BEFORE sign-in. firestore.rules require auth to read the
 * invitation, so the signed-out invitee used to see "invalid link"; the
 * page now asks /api/join/preview?token= (Admin SDK) instead.
 *
 * Whitelist only: display fields. Never hostUid, groupId, attendanceId,
 * useCount or maxUses — joining still goes through the authenticated
 * /api/join/session-token route.
 */

export const SESSION_TOKEN_RE = /^si_[A-Z0-9]{6,32}$/;

export type SessionPreviewReason = 'not_found' | 'expired' | 'max_uses_reached';

export interface SessionInvitePreview {
  groupName: string;
  sessionDate: string;
  sessionTime: string;
  source?: 'run-invite';
  activityType?: 'running' | 'walking';
}

export type SessionPreviewResult =
  | { valid: true; invitation: SessionInvitePreview }
  | { valid: false; reason: SessionPreviewReason };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function millisOf(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

/** Same validity rules as validateSessionInvitation (client) and joinEngine. */
export function buildSessionPreview(data: Record<string, unknown> | undefined, nowMs: number): SessionPreviewResult {
  if (!data) return { valid: false, reason: 'not_found' };
  const expires = millisOf(data.expiresAt);
  if (expires === null || expires < nowMs) return { valid: false, reason: 'expired' };
  const maxUses = typeof data.maxUses === 'number' ? data.maxUses : undefined;
  const useCount = typeof data.useCount === 'number' ? data.useCount : 0;
  if (maxUses !== undefined && useCount >= maxUses) return { valid: false, reason: 'max_uses_reached' };
  const activityType = data.activityType === 'walking' || data.activityType === 'running' ? data.activityType : undefined;
  return {
    valid: true,
    invitation: {
      groupName: str(data.groupName),
      sessionDate: str(data.sessionDate),
      sessionTime: str(data.sessionTime),
      ...(data.source === 'run-invite' ? { source: 'run-invite' as const } : {}),
      ...(activityType ? { activityType } : {}),
    },
  };
}
