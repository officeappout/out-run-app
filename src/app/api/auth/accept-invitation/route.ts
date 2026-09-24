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
 * (authorityId/tenantId/unitId, allowedSections, teamRole, email) comes
 * from the invitation document itself, never from the request body.
 *
 * Six requirements, all enforced below:
 *   1. verifyIdToken server-side; email_verified must be true.
 *   2. Token email must equal the invitation's email (case-insensitive).
 *   3. Second layer, redundant with firestore.rules' admin_invitations
 *      `allow read: if isRootAdmin()`: the invitation's creator must have
 *      been ENTITLED to create that specific role (see
 *      isCreatorEntitledForRole below — root for every pre-existing role
 *      plus the new tenant_owner; for unit_admin, EITHER root OR a valid,
 *      matching-tenant tenant_owner, the tenant_owner case re-checked LIVE
 *      at accept-time, not from a stored snapshot — so a tenant_owner
 *      replaced between invite and accept correctly invalidates their
 *      still-pending invitations too).
 *   4. Validity + expiry checked before role/email/createdBy — cheapest,
 *      most fundamental gate, checked first by design.
 *   5. Every written field is read from the invitation doc, never from
 *      the request body (the request body only ever contains invitationId).
 *   6. The actual write + "used" marking happen in one Firestore
 *      transaction — no window where an invitation could be replayed.
 *
 * 24.09.2026 — Stage 2 of the military/school vertical build added
 * `tenant_owner` (writes core.tenantId/isTenantOwner/tenantType +
 * arrayUnions into authorities/{tenantId}.managerIds — mechanically
 * identical to authority_manager, just a different core-field shape) and
 * `unit_admin` (writes core.tenantId/unitId/unitPath/authorityId +
 * arrayUnions into tenants/{tenantId}/units/{unitId}.managerIds — the new
 * unit-level manager field Stage 0 introduced). super_admin is never
 * created via invitation — root is root, not grantable. vertical_admin is
 * still rejected until that vertical is built (SPEC §10/§11).
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { FieldValue } from 'firebase-admin/firestore';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { tenantTypeOf } from '@/lib/tenantType';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_ROLES = new Set(['authority_manager', 'platform_member', 'tenant_owner', 'unit_admin']);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Caller {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Requirement 3's entitlement check, generalized beyond "creator is root."
 * authority_manager / platform_member / tenant_owner: unchanged — the
 * creator must be root (these are all level-1-or-platform roles, and SPEC
 * §3 has only root creating those). unit_admin: TWO entitled creators,
 * mirroring the create-route's two-path rule (24.09.2026, SPEC §10's
 * manager-departure decision — root is the final key) — either root
 * (checked by createdByEmail, same as every other role), or a CURRENT
 * tenant_owner of that SAME tenantId, re-resolved LIVE via
 * resolveUnitPermissionScope(inv.createdBy), never trusted from a value
 * stored at invitation-creation time.
 */
async function isCreatorEntitledForRole(db: Firestore, inv: FirebaseFirestore.DocumentData): Promise<boolean> {
  if (inv.role === 'unit_admin') {
    if (isRootAdmin(inv.createdByEmail ?? null)) return true;
    if (typeof inv.createdBy !== 'string' || !inv.createdBy) return false;
    const scope = await resolveUnitPermissionScope(inv.createdBy);
    return scope.kind === 'tenantOwner' && scope.tenantId === inv.tenantId;
  }
  return isRootAdmin(inv.createdByEmail ?? null);
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout the
 * military/school vertical build. `caller` is already-verified.
 */
export async function computeAcceptInvitation(db: Firestore, caller: Caller, invitationId: string) {
  if (!caller.emailVerified || !caller.email) {
    return { status: 401 as const, body: { error: 'Email must be verified' } };
  }
  if (!invitationId) {
    return { status: 400 as const, body: { error: 'invitationId is required' } };
  }

  const invRef = db.collection('admin_invitations').doc(invitationId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) {
    return { status: 404 as const, body: { error: 'Invitation not found' } };
  }
  const inv = invSnap.data()!;

  // 4. Validity + expiry — checked before everything else.
  if (inv.isUsed === true) {
    return { status: 403 as const, body: { error: 'Invitation already used' } };
  }
  const expiresAtMs = inv.expiresAt?.toMillis?.() ?? 0;
  if (!expiresAtMs || expiresAtMs < Date.now()) {
    return { status: 403 as const, body: { error: 'Invitation expired' } };
  }

  if (!SUPPORTED_ROLES.has(inv.role)) {
    return { status: 400 as const, body: { error: 'Role not supported' } };
  }

  // 2. Email match.
  const invEmail = typeof inv.email === 'string' ? inv.email.toLowerCase() : '';
  if (invEmail !== caller.email.toLowerCase()) {
    return { status: 403 as const, body: { error: 'Invitation email does not match your account' } };
  }

  // 3. Second-layer check: the invitation's creator must be entitled.
  if (!(await isCreatorEntitledForRole(db, inv))) {
    return { status: 403 as const, body: { error: 'Invitation was not created by an entitled admin' } };
  }

  const authorityId: string | null = inv.role === 'authority_manager' ? (inv.authorityId ?? null) : null;
  if (inv.role === 'authority_manager' && !authorityId) {
    return { status: 400 as const, body: { error: 'Invitation is missing authorityId' } };
  }
  const tenantId: string | null = inv.role === 'tenant_owner' || inv.role === 'unit_admin' ? (inv.tenantId ?? null) : null;
  if ((inv.role === 'tenant_owner' || inv.role === 'unit_admin') && !tenantId) {
    return { status: 400 as const, body: { error: 'Invitation is missing tenantId' } };
  }
  const unitId: string | null = inv.role === 'unit_admin' ? (inv.unitId ?? null) : null;
  if (inv.role === 'unit_admin' && !unitId) {
    return { status: 400 as const, body: { error: 'Invitation is missing unitId' } };
  }

  // authority_manager and tenant_owner are mechanically identical at the
  // authorities/{id}.managerIds level — only the core-field SHAPE they
  // write differs. Unified under one id here to avoid duplicating the
  // read+arrayUnion logic.
  const authorityLikeId: string | null = authorityId ?? tenantId;

  try {
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

      const userRef = db.collection('users').doc(caller.uid);
      const userSnap = await tx.get(userRef);

      let authorityRef: FirebaseFirestore.DocumentReference | null = null;
      let authorityManagerIds: string[] = [];
      let tenantType: string | null = null;
      if ((inv.role === 'authority_manager' || inv.role === 'tenant_owner') && authorityLikeId) {
        authorityRef = db.collection('authorities').doc(authorityLikeId);
        const authoritySnap = await tx.get(authorityRef);
        if (!authoritySnap.exists) {
          throw new HttpError(400, 'Authority no longer exists');
        }
        authorityManagerIds = authoritySnap.data()?.managerIds || [];
        if (inv.role === 'tenant_owner') {
          tenantType = tenantTypeOf((authoritySnap.data()?.type as string) ?? '');
        }
      }

      let unitRef: FirebaseFirestore.DocumentReference | null = null;
      let unitManagerIds: string[] = [];
      let unitPath: string[] = [];
      if (inv.role === 'unit_admin' && tenantId && unitId) {
        unitRef = db.collection('tenants').doc(tenantId).collection('units').doc(unitId);
        const unitSnap = await tx.get(unitRef);
        if (!unitSnap.exists) {
          throw new HttpError(400, 'Unit no longer exists');
        }
        unitManagerIds = unitSnap.data()?.managerIds || [];
        const rawPath = unitSnap.data()?.unitPath;
        unitPath = Array.isArray(rawPath) ? rawPath : [];
      }

      // ── Writes — every value below comes from `inv` (the invitation
      // doc) or from a doc read above, never from the request body. ──
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
        } else if (inv.role === 'tenant_owner') {
          update['core.tenantId'] = tenantId;
          update['core.isTenantOwner'] = true;
          update['core.tenantType'] = tenantType;
        } else if (inv.role === 'unit_admin') {
          update['core.tenantId'] = tenantId;
          update['core.unitId'] = unitId;
          update['core.unitPath'] = unitPath;
          update['core.authorityId'] = tenantId;
        }
        tx.update(userRef, update);
      } else {
        const core: Record<string, unknown> = {
          name: caller.name || inv.email.split('@')[0],
          email: inv.email,
          isApproved: true,
        };
        if (inv.role === 'authority_manager') {
          core.authorityId = authorityId;
        } else if (inv.role === 'platform_member') {
          core.allowedSections = inv.allowedSections ?? [];
          if (inv.teamRole) core.teamRole = inv.teamRole;
        } else if (inv.role === 'tenant_owner') {
          core.tenantId = tenantId;
          core.isTenantOwner = true;
          core.tenantType = tenantType;
        } else if (inv.role === 'unit_admin') {
          core.tenantId = tenantId;
          core.unitId = unitId;
          core.unitPath = unitPath;
          core.authorityId = tenantId;
        }
        tx.set(userRef, {
          id: caller.uid,
          core,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (authorityRef && !authorityManagerIds.includes(caller.uid)) {
        tx.update(authorityRef, { managerIds: FieldValue.arrayUnion(caller.uid) });
      }
      if (unitRef && !unitManagerIds.includes(caller.uid)) {
        tx.update(unitRef, { managerIds: FieldValue.arrayUnion(caller.uid) });
      }

      tx.update(invRef, {
        isUsed: true,
        usedAt: FieldValue.serverTimestamp(),
        usedBy: caller.uid,
      });
    });

    return { status: 200 as const, body: { ok: true, role: inv.role, authorityId, tenantId, unitId } };
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status as 400 | 403 | 404, body: { error: err.message } };
    }
    throw err;
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

    const result = await computeAcceptInvitation(db, { uid, email, emailVerified, name }, invitationId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/auth/accept-invitation] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
