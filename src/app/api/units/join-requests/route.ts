/**
 * POST /api/units/join-requests — create (or re-request, after a rejection)
 * a request to join a `tenants/{tenantId}/units/{unitId}`.
 *
 * Stage 1 of the military/school vertical build (see .claude/plans/tenant-
 * military-school-vertical-model.md §ח). Part of the minimal end-to-end
 * loop David asked for: create request → approve/reject (decide/route.ts)
 * → "my status" (me/route.ts).
 *
 * `unit_join_requests/{uid}` — doc ID is the REQUESTER's own uid, not an
 * auto-id. This is deliberate: it gives "at most one request doc per user"
 * for free, which is what makes the "two simultaneous requests from the
 * same user → only one stays active" property hold structurally (via
 * Firestore's own transaction contention handling — see
 * computeCreateJoinRequest below) rather than via extra application logic.
 *
 * "Unit doesn't exist" must not be distinguishable from any other reason a
 * create attempt is rejected (David's explicit negative-test requirement)
 * — every invalid-target failure here returns the exact same generic
 * message and status, so a caller can never use this endpoint to enumerate
 * real vs. fake tenantId/unitId pairs.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INVALID_TARGET_MESSAGE = 'לא ניתן ליצור בקשה עבור היחידה המבוקשת. ודא שפרטי היחידה נכונים.';
const ALREADY_PENDING_MESSAGE = 'כבר קיימת בקשה ממתינה לאישור. יש להמתין לתשובה.';
const ALREADY_MEMBER_MESSAGE = 'המשתמש כבר משויך ליחידה זו.';
const RATE_LIMITED_MESSAGE = 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.';

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches statistics-summary/insights-summary's established
 * compute-function split.
 */
export async function computeCreateJoinRequest(db: Firestore, uid: string, body: unknown) {
  const tenantId = typeof (body as { tenantId?: unknown } | null)?.tenantId === 'string' ? (body as { tenantId: string }).tenantId : '';
  const unitId = typeof (body as { unitId?: unknown } | null)?.unitId === 'string' ? (body as { unitId: string }).unitId : '';

  if (!tenantId || !unitId) {
    return { status: 400 as const, body: { error: INVALID_TARGET_MESSAGE } };
  }

  const unitSnap = await db.collection('tenants').doc(tenantId).collection('units').doc(unitId).get();
  if (!unitSnap.exists) {
    return { status: 400 as const, body: { error: INVALID_TARGET_MESSAGE } };
  }

  return db.runTransaction(async (tx) => {
    const reqRef = db.collection('unit_join_requests').doc(uid);
    const existing = await tx.get(reqRef);

    if (existing.exists) {
      const existingStatus = existing.data()?.status;
      if (existingStatus === 'pending') {
        return { status: 409 as const, body: { error: ALREADY_PENDING_MESSAGE } };
      }
      if (existingStatus === 'approved') {
        return { status: 409 as const, body: { error: ALREADY_MEMBER_MESSAGE } };
      }
      // existingStatus === 'rejected' → falls through, re-request allowed
      // (rate-limited by the HTTP handler before this function ever runs).
    }

    tx.set(reqRef, {
      uid,
      tenantId,
      unitId,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
    });

    return { status: 200 as const, body: { status: 'pending' as const } };
  });
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();

    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const rateLimited = await isRateLimited(db, `join-request-retry:${uid}`, RATE_LIMITS.unitJoinRequest.uidDaily());
    if (rateLimited) {
      return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await computeCreateJoinRequest(db, uid, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/join-requests] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
