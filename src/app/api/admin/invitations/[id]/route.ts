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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let email: string | null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      email = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    if (!isRootAdmin(email)) {
      return NextResponse.json({ error: 'Only root admins can delete invitations' }, { status: 403 });
    }

    const invitationId = params.id;
    if (!invitationId) {
      return NextResponse.json({ error: 'invitation id required' }, { status: 400 });
    }

    const db = getAdminDb();
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
