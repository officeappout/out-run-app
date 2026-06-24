/**
 * POST /api/join/session-token
 *
 * Thin wrapper around joinEngine — called by consumeSessionInvitation() after the
 * client-side attendance writes (useCount increment, attendee profile update).
 *
 * Delegates all resolution + atomic writes to joinEngine:
 *   1. Validates token against group_invitations/{token} (expiry + groupId match)
 *   2. Reads + completes user shell (progression seed, read-before-write)
 *   3. Atomic triple-write: community_groups/members + user_memberships + users.social.groupIds
 *   4. Returns only after commit — client may call joinViaDeepLink + setMembershipReady()
 *
 * Previously this route omitted the social.groupIds write (thin join path assumption).
 * The engine now always writes all three docs atomically, fixing the race where
 * useWorkoutPresence guard would fire every session start for session-token joiners
 * (guard checks social.groupIds and was never seeing it set for these users).
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Body: { token: string; groupId: string }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { joinEngine, JoinEngineError } from '@/lib/joinEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    let displayName: string;
    try {
      // checkRevoked=true so stolen anonymous tokens are rejected promptly.
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      displayName = decoded.name ?? 'משתמש';
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = await request.json();
    const { token, groupId } = body as { token?: string; groupId?: string };

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }
    if (!groupId || typeof groupId !== 'string' || groupId.trim().length === 0) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    // ── Engine — validates token, seeds shell, writes atomically ──────────────
    try {
      await joinEngine({
        target: { type: 'session', token, claimedGroupId: groupId },
        uid,
        displayName,
      });
    } catch (err) {
      if (err instanceof JoinEngineError) {
        // Map engine error codes to the HTTP responses the client already expects.
        const status =
          err.code === 'target-not-found' || err.code === 'token-group-mismatch' ? 403 :
          err.code === 'target-expired' ? 403 :
          err.code === 'max-uses-reached' ? 403 :
          400;
        const errorKey =
          err.code === 'target-not-found' ? 'invalid-token' :
          err.code === 'token-group-mismatch' ? 'token-group-mismatch' :
          err.code === 'target-expired' ? 'token-expired' :
          err.code === 'max-uses-reached' ? 'token-max-uses' :
          err.code;
        return NextResponse.json({ error: errorKey }, { status });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/join/session-token] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
