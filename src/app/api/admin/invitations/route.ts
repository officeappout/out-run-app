/**
 * POST /api/admin/invitations — create an admin invitation.
 *
 * SPEC-PERMISSIONS-MODEL.md §7/§8 groundwork: invitation creation moved
 * server-side after the 22.09.2026 Part-0 audit found that firestore.rules'
 * `admin_invitations` write gate was `isAdmin()` (root OR any DB-flagged
 * super_admin/system_admin) — NOT root-only — so a non-root super_admin
 * could write (or forge) an invitation doc directly from the browser,
 * including a fake `createdBy` claiming root. Confirmed empirically at the
 * emulator. This route is the replacement write path; the branch also
 * narrows the Firestore rule itself to `allow write: if false` (prepared,
 * not deployed — see the rules diff in this same branch).
 *
 * Requirements enforced here:
 *   - isRootAdmin ONLY, checked server-side from the verified ID token.
 *     No client-supplied role/email/uid is trusted for authorization.
 *   - createdBy (uid) and createdByEmail are taken from the decoded token,
 *     never from the request body. createdByEmail is stored specifically
 *     so /api/auth/accept-invitation can verify "this invitation's creator
 *     is root" directly off the invitation document (isRootAdmin() is
 *     email-based, and the accept endpoint has no other cheap way to
 *     resurrect an email from a bare uid without an extra Admin Auth call).
 *   - Only two invitation types: authority_manager (authorityId must
 *     resolve to a real authorities/{id} doc) and platform_member
 *     (allowedSections required). Every other role — super_admin
 *     (root is NEVER created via invitation), tenant_owner, unit_admin,
 *     vertical_admin — is rejected: those verticals/levels aren't built
 *     (SPEC §10, §11 step 1 still ⬜).
 *   - 7-day expiry, matching the previous client-side createInvitation().
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { randomBytes } from 'crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_ROLES = new Set(['authority_manager', 'platform_member']);
const INVITE_VALIDITY_DAYS = 7;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Only root admins can create invitations' }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body?.role === 'string' ? body.role : '';

    if (!rawEmail || !rawEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!SUPPORTED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Role not supported' }, { status: 400 });
    }

    const db = getAdminDb();

    let authorityId: string | null = null;
    let allowedSections: string[] | null = null;
    let teamRole: string | null = null;

    if (role === 'authority_manager') {
      authorityId = typeof body?.authorityId === 'string' ? body.authorityId : '';
      if (!authorityId) {
        return NextResponse.json({ error: 'authorityId is required for authority_manager' }, { status: 400 });
      }
      const authoritySnap = await db.collection('authorities').doc(authorityId).get();
      if (!authoritySnap.exists) {
        return NextResponse.json({ error: 'authorityId does not exist' }, { status: 400 });
      }
    } else {
      // platform_member
      const parsedSections: string[] = Array.isArray(body?.allowedSections)
        ? body.allowedSections.filter((s: unknown) => typeof s === 'string')
        : [];
      if (parsedSections.length === 0) {
        return NextResponse.json({ error: 'allowedSections is required for platform_member' }, { status: 400 });
      }
      allowedSections = parsedSections;
      teamRole = typeof body?.teamRole === 'string' ? body.teamRole.trim() || null : null;
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_VALIDITY_DAYS);

    const docRef = await db.collection('admin_invitations').add({
      email: rawEmail,
      role,
      authorityId,
      allowedSections,
      teamRole,
      token,
      isUsed: false,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      createdByEmail: email,
    });

    // inviteLink — the self-service entry point (copy-link fallback):
    // invitee lands on /admin/authority-login, types their OWN email, and
    // /authority-portal/login sends them a fresh magic link via
    // sendAdminMagicLink (their own device, their own localStorage — safe).
    const inviteLink = `${request.nextUrl.origin}/admin/authority-login?token=${token}${authorityId ? `&authority=${authorityId}` : ''}`;

    // callbackUrl — the direct target for the magic link the panel sends
    // automatically on the caller's behalf (see sendMagicLink's
    // skipLocalStorage option). Deliberately does NOT embed `email` — an
    // invitee opening this on a different device with no localStorage
    // should hit the standard Firebase "confirm your email" prompt in
    // auth/callback, not have it silently pre-filled from the URL.
    const callbackUrl = `${request.nextUrl.origin}/admin/auth/callback?token=${token}`;

    return NextResponse.json({ invitationId: docRef.id, inviteLink, callbackUrl, email: rawEmail });
  } catch (err: any) {
    console.error('[/api/admin/invitations] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
