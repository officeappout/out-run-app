/**
 * POST /api/join/confirm
 *
 * Thin wrapper around joinEngine — confirms group membership after the user
 * has completed the identity gate (name + gender + DOB via /api/user/complete-profile).
 *
 * Delegates all resolution + atomic writes to joinEngine:
 *   1. Resolves inviteCode → verified groupId (throws if not found)
 *   2. Reads + completes user shell (progression seed, read-before-write)
 *   3. Atomic triple-write: community_groups/members + user_memberships + users.social.groupIds
 *   4. Returns only after commit — client can ungate presence query immediately
 *
 * Route-specific (not in engine):
 *   - Auth: Firebase ID token Bearer
 *   - memberCount increment (non-fatal, counter drift is acceptable)
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Body: { inviteCode: string }
 * Returns: { ok: true, groupId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
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
    let displayName: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      // Pass token name only if it's a real name (Google/Apple sign-in).
      // Anonymous users have no name in the token; passing 'משתמש' as a truthy
      // placeholder would shadow the real name in joinEngine's Firestore fallback.
      displayName = decoded.name || undefined;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = await request.json();
    const { inviteCode } = body as { inviteCode?: string };
    if (!inviteCode || typeof inviteCode !== 'string' || inviteCode.trim().length === 0) {
      return NextResponse.json({ error: 'inviteCode required' }, { status: 400 });
    }

    // ── Engine — resolves, seeds, and atomically writes ───────────────────────
    let result;
    try {
      result = await joinEngine({
        target: { type: 'group', inviteCode },
        uid,
        displayName,
      });
    } catch (err) {
      if (err instanceof JoinEngineError) {
        if (err.code === 'target-not-found') {
          return NextResponse.json({ error: 'invalid-invite-code' }, { status: 404 });
        }
        return NextResponse.json({ error: err.code }, { status: 400 });
      }
      throw err;
    }

    // ── Non-fatal: increment member counters (new joins only) ─────────────────
    // Counter drift is acceptable — corrected by next sync.
    if (!result.alreadyMember) {
      try {
        await getAdminDb().doc(`community_groups/${result.groupId}`).update({
          memberCount: FieldValue.increment(1),
          currentParticipants: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ ok: true, groupId: result.groupId });
  } catch (err) {
    console.error('[join/confirm] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
