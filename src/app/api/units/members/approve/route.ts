/**
 * POST /api/units/members/approve — an officer manually approves a
 * self-declared member. Slice G of the persona-unit-unification build
 * (26.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.32).
 *
 * David's framing: "היום הקצין רק צופה — רואה תיוג 'מוצהר' ואין לו מה
 * לעשות איתו." This is the first of two actions that give the officer
 * something to actually DO with that tag. Approval does NOT change who
 * the member is assigned to — "לא משנה שיוך, רק מאשר" — it only flips
 * core.unitApprovedByOfficer to true, which the panel's "מוצהר" badge
 * (already reads unitMembershipSource/unitApprovedByOfficer together —
 * see [unitId]/page.tsx's own badge condition, updated alongside this
 * endpoint) uses to stop showing the tag once a real officer has looked
 * at the declaration and approved it.
 *
 * Authorization: isMemberWithinScope (src/lib/unitPermissionScope.ts) —
 * the SAME shared check /api/units/member-workouts and .../remove use,
 * not a new rule. "the unit's own admin, or a commander above it in the
 * hierarchy" falls out of resolveUnitPermissionScope's own downward
 * inheritance (§13.28) for free.
 *
 * The target's own tenantId/unitId — read from their user doc, never
 * trusted from the request body (only `uid`, naming WHO, is client-
 * supplied) — matches every other route in this build's "never trust
 * client input for authorization-relevant facts" rule.
 *
 * Fail-closed: any lookup/authorization failure is a 403, the same
 * generic message regardless of the specific reason (denied scope, wrong
 * unit, member not found) — no existence leak, matching every other
 * route in this build.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveUnitPermissionScope, isMemberWithinScope, UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה לאשר את המשתמש הזה.';

export type ApproveMemberResult =
  | { status: 200; body: { approved: true } }
  | { status: 400 | 403 | 503; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeApproveMember(
  db: Firestore,
  scope: UnitPermissionScope,
  targetUid: string,
): Promise<ApproveMemberResult> {
  if (scope.kind === 'unknown') {
    // P1-3 item 1 (00-MASTER-PLAN.md §13.49) — verification failed, this is
    // NOT a checked "no". Distinct status + message from DENIED_MESSAGE.
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }
  if (!targetUid) {
    return { status: 400, body: { error: 'uid is required' } };
  }

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }
  const targetCore = targetSnap.data()?.core ?? {};

  if (!isMemberWithinScope(scope, targetCore.tenantId, targetCore.unitId)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  await db.collection('users').doc(targetUid).update({
    'core.unitApprovedByOfficer': true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { status: 200, body: { approved: true } };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    const rateLimited = await isRateLimited(db, `unit-member-approve:${callerUid}`, RATE_LIMITS.unitMemberApprove.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUid = typeof (body as Record<string, unknown>)?.uid === 'string' ? (body as Record<string, unknown>).uid as string : '';

    const scope = await resolveUnitPermissionScope(callerUid);
    const result = await computeApproveMember(db, scope, targetUid);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/members/approve] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
