/**
 * POST /api/units/join-requests/decide — approve or reject a pending unit
 * join request.
 *
 * Stage 1 of the military/school vertical build (see .claude/plans/tenant-
 * military-school-vertical-model.md §ח).
 *
 * Hard requirements (David, 23.09.2026):
 *   1. The unit/tenant being decided on is taken from the REQUEST DOCUMENT
 *      itself (`unit_join_requests/{targetUid}`), and the approver is
 *      checked against THAT unit/tenant's own managerIds — never from
 *      anything the HTTP request body sends. The body carries only
 *      `{targetUid, decision}`; there is no tenantId/unitId parameter here
 *      at all for a caller to even attempt to spoof.
 *   4. All writes go through the server (Admin SDK) — firestore.rules is
 *      not touched this round.
 *
 * "Unit A's manager approving unit B's request" and "a regular user
 * approving their own request" must both be rejected, and "a request for a
 * unit that doesn't exist" must not be distinguishable from any other
 * rejection reason — so every failure branch below (not found, already
 * decided, wrong scope, denied scope) returns the exact same generic
 * message and status. Never branch the response shape/message on which
 * specific check failed.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISION_DENIED_MESSAGE = 'לא ניתן לעדכן את הבקשה המבוקשת.';

type Decision = 'approve' | 'reject';

function isAuthorizedForRequest(scope: UnitPermissionScope, tenantId: string, unitId: string): boolean {
  if (scope.kind === 'root') return true;
  if (scope.kind === 'tenantOwner') return scope.tenantId === tenantId;
  if (scope.kind === 'unitAdmin') return scope.tenantId === tenantId && scope.unitIds.includes(unitId);
  return false;
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches statistics-summary/insights-summary's established
 * compute-function split. `scope` is already-resolved (by
 * resolveUnitPermissionScope, uid-only input) — this function never reads
 * anything client-supplied for authorization, only `targetUid`+`decision`
 * to know WHICH request and WHAT outcome.
 */
export async function computeDecideJoinRequest(
  db: Firestore,
  scope: UnitPermissionScope,
  approverUid: string,
  targetUid: string,
  decision: Decision,
) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: DECISION_DENIED_MESSAGE } };
  }

  return db.runTransaction(async (tx) => {
    const reqRef = db.collection('unit_join_requests').doc(targetUid);
    const reqSnap = await tx.get(reqRef);

    if (!reqSnap.exists) {
      return { status: 403 as const, body: { error: DECISION_DENIED_MESSAGE } };
    }

    const reqData = reqSnap.data() as { tenantId: string; unitId: string; status: string };
    if (reqData.status !== 'pending') {
      return { status: 403 as const, body: { error: DECISION_DENIED_MESSAGE } };
    }

    if (!isAuthorizedForRequest(scope, reqData.tenantId, reqData.unitId)) {
      return { status: 403 as const, body: { error: DECISION_DENIED_MESSAGE } };
    }

    // All reads (Firestore transactions require every read before any
    // write) — the unit doc is only needed to carry unitPath onto the
    // approved user's core fields.
    let unitPath: string[] = [];
    if (decision === 'approve') {
      const unitSnap = await tx.get(db.collection('tenants').doc(reqData.tenantId).collection('units').doc(reqData.unitId));
      const rawPath = unitSnap.data()?.unitPath;
      unitPath = Array.isArray(rawPath) ? (rawPath as string[]) : [];
    }

    tx.update(reqRef, {
      status: decision === 'approve' ? 'approved' : 'rejected',
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: approverUid,
    });

    if (decision === 'approve') {
      // Mirrors the dead invitation.service.ts's exact unit_admin/
      // tenant_owner write shape (core.tenantId/unitId/unitPath/
      // authorityId) for continuity with whatever else already expects
      // these field names (readiness.service.ts, grades.service.ts).
      tx.set(
        db.collection('users').doc(targetUid),
        {
          core: {
            tenantId: reqData.tenantId,
            unitId: reqData.unitId,
            unitPath,
            authorityId: reqData.tenantId,
          },
        },
        { merge: true },
      );
    }

    return { status: 200 as const, body: { status: decision === 'approve' ? ('approved' as const) : ('rejected' as const) } };
  });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let approverUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      approverUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const targetUid = typeof body?.targetUid === 'string' ? body.targetUid : '';
    const decision: Decision | null = body?.decision === 'approve' || body?.decision === 'reject' ? body.decision : null;
    if (!targetUid || !decision) {
      return NextResponse.json({ error: DECISION_DENIED_MESSAGE }, { status: 400 });
    }

    const scope = await resolveUnitPermissionScope(approverUid);
    const db = getAdminDb();
    const result = await computeDecideJoinRequest(db, scope, approverUid, targetUid, decision);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/join-requests/decide] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
