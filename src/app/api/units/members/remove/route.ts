/**
 * POST /api/units/members/remove — an officer removes a member from
 * their unit. Slice G of the persona-unit-unification build (26.09.2026,
 * see docs/audit-2026-09/00-MASTER-PLAN.md §13.32).
 *
 * Hard requirements (David, 26.09.2026):
 *   1. The unit is taken from the MEMBER'S OWN document (core.tenantId/
 *      unitId), never from the request body — only `uid`, naming WHO to
 *      remove, is client-supplied. Matches every other route in this
 *      build's "never trust client input for authorization-relevant
 *      facts" rule (same shape as join-requests/decide's own header
 *      comment on this exact point).
 *   2. Only the unit's own admin, or a commander above it in the
 *      hierarchy — isMemberWithinScope (src/lib/unitPermissionScope.ts),
 *      the SAME shared check /api/units/member-workouts and .../approve
 *      use. "Commander above in the hierarchy" falls out of
 *      resolveUnitPermissionScope's own downward inheritance (§13.28) for
 *      free — NO new authorization logic here.
 *   3. Failure = rejection, fail-closed, same generic message regardless
 *      of the specific reason (denied scope, wrong unit, member not
 *      found) — no existence leak.
 *   4. Every removal is logged: who removed, whom, from which unit, when
 *      — unit_removals/{autoId}, written atomically in the SAME batch as
 *      the removal itself (never a removal that "succeeded" with no
 *      record, or a log entry with no matching removal).
 *   5. Confirmation before execution — a CLIENT-side requirement (a
 *      confirm dialog before this endpoint is ever called), not enforced
 *      here; this endpoint executes immediately once called, same as
 *      every other write endpoint in this build.
 *
 * Re-entry blocking (§13.17→§13.32's own decision — the WRITE side of an
 * already-existing READ check): removal also appends this member's
 * directoryId (`${tenantId}__${unitId}`, the SAME scheme
 * resolveAncestorChain/onUnitWrite.ts already use) to
 * core.blockedUnitIds via arrayUnion — POST /api/units/declare has
 * checked this field since Slice A (25.09.2026, §13.25) specifically in
 * anticipation of this write existing; confirmed here to be the right
 * structure (same directoryId scheme, same field, same array shape) —
 * not a new mechanism. LIFTING that block (an officer's explicit
 * "allow them back") is NOT built here — see §13.32's own report for
 * that proposal; this endpoint only ever adds to blockedUnitIds, never
 * removes from it.
 *
 * Atomicity: one db.batch() covers all three writes (users/{uid} field
 * clear + blockedUnitIds append, military_declarations/{uid} delete,
 * unit_removals/{autoId} create) — CLAUDE.md's "all-or-nothing writes"
 * law, same as every other multi-document write in this build. A commit
 * failure leaves every one of the three documents exactly as they were.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveUnitPermissionScope, isMemberWithinScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה להסיר את המשתמש הזה.';
const SAVE_FAILED_MESSAGE = 'ההסרה נכשלה. נסה שוב.';

export type RemoveMemberResult =
  | { status: 200; body: { removed: true } }
  | { status: 400 | 403 | 500; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeRemoveMember(
  db: Firestore,
  scope: UnitPermissionScope,
  callerUid: string,
  targetUid: string,
): Promise<RemoveMemberResult> {
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
  const tenantId: unknown = targetCore.tenantId;
  const unitId: unknown = targetCore.unitId;

  if (!isMemberWithinScope(scope, tenantId, unitId)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }
  // isMemberWithinScope already confirmed both are real, matching
  // strings for the unitAdmin/tenantOwner branches — root's branch
  // allows anyone through regardless, so guard here too (defense in
  // depth against a malformed doc reaching this far).
  if (typeof tenantId !== 'string' || typeof unitId !== 'string') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const directoryId = `${tenantId}__${unitId}`;

  const batch = db.batch();
  batch.update(db.collection('users').doc(targetUid), {
    'core.tenantId': FieldValue.delete(),
    'core.unitId': FieldValue.delete(),
    'core.unitPath': FieldValue.delete(),
    'core.tenantType': FieldValue.delete(),
    'core.unitMembershipSource': FieldValue.delete(),
    'core.unitApprovedByOfficer': FieldValue.delete(),
    'core.unitDeclaredAt': FieldValue.delete(),
    'core.blockedUnitIds': FieldValue.arrayUnion(directoryId),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(db.collection('military_declarations').doc(targetUid));
  batch.set(db.collection('unit_removals').doc(), {
    removedUid: targetUid,
    removedBy: callerUid,
    tenantId,
    unitId,
    removedAt: FieldValue.serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    console.error('[/api/units/members/remove] batch commit failed:', err);
    return { status: 500, body: { error: SAVE_FAILED_MESSAGE } };
  }

  return { status: 200, body: { removed: true } };
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

    const rateLimited = await isRateLimited(db, `unit-member-remove:${callerUid}`, RATE_LIMITS.unitMemberRemove.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUid = typeof (body as Record<string, unknown>)?.uid === 'string' ? (body as Record<string, unknown>).uid as string : '';

    const scope = await resolveUnitPermissionScope(callerUid);
    const result = await computeRemoveMember(db, scope, callerUid, targetUid);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/members/remove] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
