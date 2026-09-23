/**
 * DELETE /api/admin/invitations/[id] — cancel/delete a pending invitation.
 *
 * Part of the same 22.09.2026 migration as POST /api/admin/invitations:
 * deleteInvitationById() in invitation.service.ts used to delete the
 * Firestore doc directly from the client (gated only by admin_invitations'
 * former `isAdmin()` write rule — the same over-broad gate Part 0 found).
 * Moved here, root-only, matching POST's authorization model — the branch's
 * `admin_invitations` rule is `allow write: if false`, so this is now the
 * only way to remove an invitation at all, from any caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ip = getRequestIp(request);
    const db = getAdminDb();

    // Same shared budget as POST /api/admin/invitations — see that
    // route's comment.
    const ipCheck = await isBlockedByAny(db, [
      { key: `admin-invitations:ip:${ip}:short`, window: RATE_LIMITS.adminInvitations.ipShort() },
      { key: `admin-invitations:ip:${ip}:hourly`, window: RATE_LIMITS.adminInvitations.ipHourly() },
    ]);
    if (ipCheck.blocked) {
      logRateLimitBlock({ route: 'admin-invitations', dimension: 'ip', ip });
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((ipCheck.window?.windowMs ?? 900_000) / 1000)) } });
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    let email: string | null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
      email = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    if (!isRootAdmin(email)) {
      return NextResponse.json({ error: 'Only root admins can delete invitations' }, { status: 403 });
    }

    const adminCheck = await isBlockedByAny(db, [
      { key: `admin-invitations:admin:${uid}:short`, window: RATE_LIMITS.adminInvitations.adminShort() },
      { key: `admin-invitations:admin:${uid}:hourly`, window: RATE_LIMITS.adminInvitations.adminHourly() },
    ]);
    if (adminCheck.blocked) {
      logRateLimitBlock({ route: 'admin-invitations', dimension: 'admin', ip, identifier: uid });
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((adminCheck.window?.windowMs ?? 900_000) / 1000)) } });
    }

    const invitationId = params.id;
    if (!invitationId) {
      return NextResponse.json({ error: 'invitation id required' }, { status: 400 });
    }

    const docRef = db.collection('admin_invitations').doc(invitationId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/admin/invitations/[id]] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
