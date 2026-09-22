/**
 * POST /api/auth/accept-invitation — accept an admin invitation.
 *
 * SPEC-PERMISSIONS-MODEL.md §7. Replaces the client-side
 * applyInvitationToUser() flow (invitation.service.ts), which wrote
 * users/{uid} + authorities/{id}.managerIds + admin_invitations directly
 * from the browser — blocked outright for a brand-new invitee by
 * firestore.rules' noAdminFieldsChanged() (SPEC §6.1, the
 * chicken-and-egg problem: the invitee has no stored doc yet, so there's
 * nothing for isAdmin() to read a role off of). Moving this server-side
 * with the Admin SDK sidesteps Security Rules entirely (by Firebase's own
 * design — rules never apply to Admin SDK writes), which is the only way
 * to resolve §6.1: the FIRST write to a brand-new invitee's doc can never
 * be self-authorized under a rules model that requires an existing
 * elevated doc to permit elevating a doc.
 *
 * The client sends ONLY an invitation id — every other value written
 * (authorityId, allowedSections, teamRole, email) comes from the
 * invitation document itself, never from the request body.
 *
 * Six requirements, all enforced below:
 *   1. verifyIdToken server-side; email_verified must be true.
 *   2. Token email must equal the invitation's email (case-insensitive).
 *   3. Second layer, redundant with firestore.rules' admin_invitations
 *      `allow read: if isRootAdmin()`: the invitation's OWN createdByEmail
 *      (set server-side by POST /api/admin/invitations, never by the
 *      client) must pass isRootAdmin(). An invitation with no
 *      createdByEmail at all (e.g. one that predates this migration) is
 *      rejected the same way — untrusted provenance, not assumed safe.
 *   4. Validity + expiry checked before role/email/createdBy — cheapest,
 *      most fundamental gate, checked first by design.
 *   5. Every written field is read from the invitation doc, never from
 *      the request body (the request body only ever contains invitationId).
 *   6. The actual write + "used" marking happen in one Firestore
 *      transaction — no window where an invitation could be replayed.
 *
 * Only two invitation types are supported here, matching
 * POST /api/admin/invitations: authority_manager (managerIds + core.
 * authorityId) and platform_member (core.allowedSections + core.
 * teamRole). super_admin is never created via invitation — root is
 * root, not grantable. tenant_owner/unit_admin/vertical_admin are
 * rejected until those verticals are built (SPEC §10/§11).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { FieldValue } from 'firebase-admin/firestore';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_ROLES = new Set(['authority_manager', 'platform_member']);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit by IP before the (real) Firebase ID-token verify below.
    // The invitationId itself is an unguessable Firestore doc ID, so
    // brute force isn't the risk here — a runaway script or scripted
    // hammering is. See .claude/plans/rate-limiting-sensitive-endpoints.md
    // part ב (priority 2).
    const ip = getRequestIp(request);
    const db = getAdminDb();
    const { blocked, window } = await isBlockedByAny(db, [
      { key: `accept-invitation:ip:${ip}:short`, window: RATE_LIMITS.acceptInvitation.ipShort() },
      { key: `accept-invitation:ip:${ip}:hourly`, window: RATE_LIMITS.acceptInvitation.ipHourly() },
    ]);
    if (blocked) {
      logRateLimitBlock({ route: 'accept-invitation', dimension: 'ip', ip });
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((window?.windowMs ?? 900_000) / 1000)) } },
      );
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    let email: string | null;
    let emailVerified: boolean;
    let name: string | undefined;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
      email = (decoded.email as string | undefined) ?? null;
      emailVerified = decoded.email_verified === true;
      name = decoded.name as string | undefined;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    if (!emailVerified || !email) {
      return NextResponse.json({ error: 'Email must be verified' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : '';
    if (!invitationId) {
      return NextResponse.json({ error: 'invitationId is required' }, { status: 400 });
    }

    const invRef = db.collection('admin_invitations').doc(invitationId);
    const invSnap = await invRef.get();
    if (!invSnap.exists) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }
    const inv = invSnap.data()!;

    // 4. Validity + expiry — checked before everything else.
    if (inv.isUsed === true) {
      return NextResponse.json({ error: 'Invitation already used' }, { status: 403 });
    }
    const expiresAtMs = inv.expiresAt?.toMillis?.() ?? 0;
    if (!expiresAtMs || expiresAtMs < Date.now()) {
      return NextResponse.json({ error: 'Invitation expired' }, { status: 403 });
    }

    if (!SUPPORTED_ROLES.has(inv.role)) {
      return NextResponse.json({ error: 'Role not supported' }, { status: 400 });
    }

    // 2. Email match.
    const invEmail = typeof inv.email === 'string' ? inv.email.toLowerCase() : '';
    if (invEmail !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Invitation email does not match your account' }, { status: 403 });
    }

    // 3. Second-layer check: the invitation's creator must be root.
    if (!isRootAdmin(inv.createdByEmail ?? null)) {
      return NextResponse.json({ error: 'Invitation was not created by a root admin' }, { status: 403 });
    }

    const authorityId: string | null = inv.role === 'authority_manager' ? (inv.authorityId ?? null) : null;
    if (inv.role === 'authority_manager' && !authorityId) {
      return NextResponse.json({ error: 'Invitation is missing authorityId' }, { status: 400 });
    }

    // 6. Write + "used" marking in one transaction.
    await db.runTransaction(async (tx) => {
      // ── Reads first (Firestore transaction requirement) ──
      const freshInvSnap = await tx.get(invRef);
      const freshInv = freshInvSnap.data();
      if (!freshInvSnap.exists || !freshInv) {
        throw new HttpError(404, 'Invitation not found');
      }
      if (freshInv.isUsed === true) {
        throw new HttpError(403, 'Invitation already used');
      }
      const freshExpiresAtMs = freshInv.expiresAt?.toMillis?.() ?? 0;
      if (!freshExpiresAtMs || freshExpiresAtMs < Date.now()) {
        throw new HttpError(403, 'Invitation expired');
      }

      const userRef = db.collection('users').doc(uid);
      const userSnap = await tx.get(userRef);

      let authorityRef: FirebaseFirestore.DocumentReference | null = null;
      let authorityManagerIds: string[] = [];
      if (inv.role === 'authority_manager' && authorityId) {
        authorityRef = db.collection('authorities').doc(authorityId);
        const authoritySnap = await tx.get(authorityRef);
        if (!authoritySnap.exists) {
          throw new HttpError(400, 'Authority no longer exists');
        }
        authorityManagerIds = authoritySnap.data()?.managerIds || [];
      }

      // ── Writes — every value below comes from `inv` (the invitation
      // doc), never from the request body. ──
      if (userSnap.exists) {
        const update: Record<string, unknown> = {
          'core.isApproved': true,
          // 22.09.2026 — the create branch below has always set core.email;
          // this branch (existing account, e.g. a prior regular app user
          // being promoted) didn't, so an admin promoted through this path
          // has no core.email at all. getUserByEmail() (admin search,
          // formerly also the pre-auth login check) queries core.email —
          // silently unfindable by either. Backfill it here too.
          'core.email': inv.email,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (inv.role === 'authority_manager') {
          update['core.authorityId'] = authorityId;
        } else if (inv.role === 'platform_member') {
          update['core.allowedSections'] = inv.allowedSections ?? [];
          if (inv.teamRole) update['core.teamRole'] = inv.teamRole;
        }
        tx.update(userRef, update);
      } else {
        const core: Record<string, unknown> = {
          name: name || inv.email.split('@')[0],
          email: inv.email,
          isApproved: true,
        };
        if (inv.role === 'authority_manager') {
          core.authorityId = authorityId;
        } else if (inv.role === 'platform_member') {
          core.allowedSections = inv.allowedSections ?? [];
          if (inv.teamRole) core.teamRole = inv.teamRole;
        }
        tx.set(userRef, {
          id: uid,
          core,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (authorityRef && !authorityManagerIds.includes(uid)) {
        tx.update(authorityRef, { managerIds: FieldValue.arrayUnion(uid) });
      }

      tx.update(invRef, {
        isUsed: true,
        usedAt: FieldValue.serverTimestamp(),
        usedBy: uid,
      });
    });

    return NextResponse.json({ ok: true, role: inv.role, authorityId });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[/api/auth/accept-invitation] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
