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
 * 24.09.2026 — Stage 2 of the military/school vertical build (.claude/plans/
 * tenant-military-school-vertical-model.md §ח) added `tenant_owner` and
 * `unit_admin` as supported roles. This is a NARROW slice of SPEC §3's full
 * invitation matrix — only for the two vertical/level-2 role names Stage 0
 * already gave a concrete, tested, deployed meaning
 * (src/lib/unitPermissionScope.ts): `tenant_owner` = a manager of an
 * `authorities/{id}` doc of type military_unit/school; `unit_admin` = a
 * manager of a `tenants/{tenantId}/units/{unitId}` doc. SPEC §2.2's role-
 * name-mapping verification requirement is satisfied for exactly these two
 * names by that Stage 0 work (David's explicit product-owner sign-off,
 * 23-24.09.2026) — NOT for `vertical_admin`/`authority_manager`'s general
 * mapping, which remains unverified and untouched here.
 *
 * Requirements enforced below (unchanged roles: authority_manager,
 * platform_member — still root-only, logic untouched by this stage):
 *   - isRootAdmin ONLY, checked server-side from the verified ID token.
 *     No client-supplied role/email/uid is trusted for authorization.
 *   - createdBy (uid) and createdByEmail are taken from the decoded token,
 *     never from the request body.
 *   - Every other role — super_admin (root is NEVER created via
 *     invitation), vertical_admin — is rejected: not built (SPEC §10).
 *   - 7-day expiry, matching the previous client-side createInvitation().
 *
 * New requirements for this stage (David, 24.09.2026, verbatim constraints):
 *   - `tenant_owner`: root creates it ONLY. Deliberately narrower than SPEC
 *     §3's general "root creates any role at any level" row — root's
 *     invitation power for THIS vertical, THIS stage, stops at tenant_owner.
 *     Creating a unit_admin directly (bypassing the tenant_owner) is
 *     rejected, even for root. tenantId is client-supplied (root has
 *     platform-wide domain, same as authority_manager's authorityId today)
 *     but verified server-side to be a real military_unit/school authority.
 *   - `unit_admin`: ONLY a tenant_owner can create one, and only for a unit
 *     under their OWN tenant — "היחידה נבדקת בשרת מול השיוך שלו, לא ממה
 *     שנשלח בבקשה." The request body for this role carries `unitId` ONLY;
 *     there is no tenantId field to even read from it — the tenant is
 *     always the caller's own resolveUnitPermissionScope(uid).tenantId, a
 *     server-side fact, never a client claim. Every failure in this branch
 *     (not a tenant owner at all / unit belongs to a different tenant /
 *     unit doesn't exist) returns the exact same generic 403, so a caller
 *     can never distinguish "you're not authorized" from "that unit isn't
 *     real" — mirrors Stage 1's join-requests/decide discipline.
 *   - `unit_admin` invites nobody (enforced implicitly: SUPPORTED_ROLES'
 *     branch for unit_admin-as-CREATOR doesn't exist — resolveUnitPermission
 *     Scope(uid).kind === 'unitAdmin' never satisfies any branch below,
 *     always falls through to "not entitled").
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';
import { randomBytes } from 'crypto';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_ROLES = new Set(['authority_manager', 'platform_member', 'tenant_owner', 'unit_admin']);
const TENANT_AUTHORITY_TYPES = ['military_unit', 'school'];
const INVITE_VALIDITY_DAYS = 7;

const ROOT_ONLY_MESSAGE = 'Only root admins can create invitations';
const UNIT_ADMIN_INVITE_DENIED_MESSAGE = 'אין לך הרשאה להזמין מנהל ליחידה זו.';

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

interface Caller {
  uid: string;
  email: string | null;
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split established in Stage 0/1
 * (src/app/api/units/join-requests/*) and Task 3's statistics-summary/
 * insights-summary. `caller` is already-verified (uid+email from a decoded
 * token) — this function performs no token verification itself, only
 * role-matrix + domain authorization and the actual write.
 */
export async function computeCreateInvitation(db: Firestore, caller: Caller, body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawEmail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const role = typeof b.role === 'string' ? b.role : '';

  if (!rawEmail || !rawEmail.includes('@')) {
    return { status: 400 as const, body: { error: 'Valid email is required' } };
  }
  if (!SUPPORTED_ROLES.has(role)) {
    return { status: 400 as const, body: { error: 'Role not supported' } };
  }

  let authorityId: string | null = null;
  let allowedSections: string[] | null = null;
  let teamRole: string | null = null;
  let tenantId: string | null = null;
  let unitId: string | null = null;

  if (role === 'authority_manager') {
    if (!isRootAdmin(caller.email)) {
      return { status: 403 as const, body: { error: ROOT_ONLY_MESSAGE } };
    }
    authorityId = typeof b.authorityId === 'string' ? b.authorityId : '';
    if (!authorityId) {
      return { status: 400 as const, body: { error: 'authorityId is required for authority_manager' } };
    }
    const authoritySnap = await db.collection('authorities').doc(authorityId).get();
    if (!authoritySnap.exists) {
      return { status: 400 as const, body: { error: 'authorityId does not exist' } };
    }
  } else if (role === 'platform_member') {
    if (!isRootAdmin(caller.email)) {
      return { status: 403 as const, body: { error: ROOT_ONLY_MESSAGE } };
    }
    const parsedSections: string[] = Array.isArray(b.allowedSections)
      ? (b.allowedSections as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    if (parsedSections.length === 0) {
      return { status: 400 as const, body: { error: 'allowedSections is required for platform_member' } };
    }
    allowedSections = parsedSections;
    teamRole = typeof b.teamRole === 'string' ? b.teamRole.trim() || null : null;
  } else if (role === 'tenant_owner') {
    // Deliberately the SAME root-only gate as authority_manager — SPEC §3's
    // "root creates any level-1 role" row, applied to this vertical.
    if (!isRootAdmin(caller.email)) {
      return { status: 403 as const, body: { error: 'Only root admins can create a tenant owner' } };
    }
    const requestedTenantId = typeof b.tenantId === 'string' ? b.tenantId : '';
    if (!requestedTenantId) {
      return { status: 400 as const, body: { error: 'tenantId is required for tenant_owner' } };
    }
    const tenantSnap = await db.collection('authorities').doc(requestedTenantId).get();
    const tenantType = (tenantSnap.data()?.type as string) ?? '';
    if (!tenantSnap.exists || !TENANT_AUTHORITY_TYPES.includes(tenantType)) {
      return { status: 400 as const, body: { error: 'tenantId must be a real military_unit or school authority' } };
    }
    tenantId = requestedTenantId;
  } else if (role === 'unit_admin') {
    // The domain check runs entirely off the CALLER's own server-resolved
    // scope — resolveUnitPermissionScope takes only caller.uid. The request
    // body is read for `unitId` alone; there is no tenantId field read from
    // it anywhere in this branch.
    const scope = await resolveUnitPermissionScope(caller.uid);
    if (scope.kind !== 'tenantOwner') {
      return { status: 403 as const, body: { error: UNIT_ADMIN_INVITE_DENIED_MESSAGE } };
    }
    const requestedUnitId = typeof b.unitId === 'string' ? b.unitId : '';
    if (!requestedUnitId) {
      return { status: 403 as const, body: { error: UNIT_ADMIN_INVITE_DENIED_MESSAGE } };
    }
    const unitSnap = await db.collection('tenants').doc(scope.tenantId).collection('units').doc(requestedUnitId).get();
    if (!unitSnap.exists) {
      return { status: 403 as const, body: { error: UNIT_ADMIN_INVITE_DENIED_MESSAGE } };
    }
    tenantId = scope.tenantId;
    unitId = requestedUnitId;
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
    tenantId,
    unitId,
    token,
    isUsed: false,
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    createdByEmail: caller.email,
  });

  return {
    status: 200 as const,
    body: { invitationId: docRef.id, token, authorityId, tenantId, unitId, email: rawEmail },
  };
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const db = getAdminDb();

    // IP dimension first — cheap, catches gross flooding before the real
    // ID-token verify below.
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

    // admin-identity dimension: moved to right after token verification
    // (24.09.2026) — this route is no longer root-only end-to-end (a
    // tenant_owner can now reach it too, for unit_admin invitations), so
    // this per-caller budget must apply to any authenticated caller who
    // reaches this point, not just a confirmed root admin. Same buckets,
    // same keys — only the position moved.
    const adminCheck = await isBlockedByAny(db, [
      { key: `admin-invitations:admin:${uid}:short`, window: RATE_LIMITS.adminInvitations.adminShort() },
      { key: `admin-invitations:admin:${uid}:hourly`, window: RATE_LIMITS.adminInvitations.adminHourly() },
    ]);
    if (adminCheck.blocked) {
      logRateLimitBlock({ route: 'admin-invitations', dimension: 'admin', ip, identifier: uid });
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((adminCheck.window?.windowMs ?? 900_000) / 1000)) } });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await computeCreateInvitation(db, { uid, email }, body);

    if (result.status !== 200) {
      return NextResponse.json(result.body, { status: result.status });
    }

    // inviteLink — the self-service entry point (copy-link fallback):
    // invitee lands on /admin/authority-login, types their OWN email, and
    // /authority-portal/login sends them a fresh magic link via
    // sendAdminMagicLink (their own device, their own localStorage — safe).
    const { invitationId, token, authorityId, email: invitedEmail } = result.body;
    const inviteLink = `${request.nextUrl.origin}/admin/authority-login?token=${token}${authorityId ? `&authority=${authorityId}` : ''}`;

    // callbackUrl — the direct target for the magic link the panel sends
    // automatically on the caller's behalf (see sendMagicLink's
    // skipLocalStorage option). Deliberately does NOT embed `email` — an
    // invitee opening this on a different device with no localStorage
    // should hit the standard Firebase "confirm your email" prompt in
    // auth/callback, not have it silently pre-filled from the URL.
    const callbackUrl = `${request.nextUrl.origin}/admin/auth/callback?token=${token}`;

    return NextResponse.json({ invitationId, inviteLink, callbackUrl, email: invitedEmail });
  } catch (err: any) {
    console.error('[/api/admin/invitations] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
