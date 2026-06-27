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
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { joinEngine, JoinEngineError } from '@/lib/joinEngine';
import { addScheduleEntryAdmin } from '@/lib/addScheduleEntryAdmin';

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
    let photoURL: string | undefined;
    try {
      // checkRevoked=true so stolen anonymous tokens are rejected promptly.
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      displayName = decoded.name ?? 'משתמש';
      photoURL = (decoded as Record<string, unknown>).picture as string | undefined;
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
        photoURL,
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

    // ── Guest schedule entry (scheduled runs only) ──────────────────────────
    // Read the invitation doc to check for a scheduledFor timestamp.
    // If present, add a community entry to the guest's userSchedule so the
    // upcoming run appears in their calendar / home screen automatically.
    //
    // Non-fatal: join already succeeded; calendar is best-effort.
    try {
      const db = getAdminDb();
      const invSnap = await db.doc(`group_invitations/${token}`).get();
      const invData = invSnap.data();
      const scheduledFor = invData?.scheduledFor as string | undefined;

      if (scheduledFor) {
        const tIdx = scheduledFor.indexOf('T');
        const datePart = tIdx >= 0 ? scheduledFor.slice(0, tIdx) : scheduledFor;
        const timePart = tIdx >= 0 ? scheduledFor.slice(tIdx + 1, tIdx + 6) : '00:00';
        const invActivityType = invData?.activityType as string | undefined;
        const invActivityLabel =
          invActivityType === 'walking' ? 'הליכה' :
          invActivityType === 'cycling' ? 'רכיבה' : 'ריצה';
        const groupName = (invData?.groupName as string | undefined) ?? `${invActivityLabel} מתוזמנת`;
        const groupId   = (invData?.groupId   as string | undefined) ?? body.groupId;
        const scheduledCategories: string[] = invActivityType === 'walking' ? ['walking'] : ['cardio'];

        await addScheduleEntryAdmin(db, uid, datePart, {
          entryId:             `run_${groupId}`,
          programIds:          [],
          type:                'training',
          source:              'community',
          completed:           false,
          scheduledCategories,
          startTime:           timePart,
          groupId,
          groupName,
        });
      }
    } catch (schedErr) {
      console.error('[session-token] guest schedule entry FAILED — non-fatal:', schedErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/join/session-token] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
