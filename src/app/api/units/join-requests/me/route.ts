/**
 * GET /api/units/join-requests/me — the caller's own unit join-request
 * status. Zero parameters besides the bearer token.
 *
 * Stage 1 of the military/school vertical build (see .claude/plans/tenant-
 * military-school-vertical-model.md §ח).
 *
 * Hard requirement (David, 23.09.2026): "הסטטוס שלי" מחזיר אך ורק את הבקשה
 * של מי ששלח, לפי ה-uid מהטוקן. אסור שתהיה שום דרך לשאול על בקשה של מישהו
 * אחר, גם לא בטעות. — there is no uid/targetUid parameter anywhere on this
 * route (query string, body, or otherwise): the ONLY lookup key is the
 * verified token's own uid, so "read another uid's status" has no code
 * path to even attempt.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches statistics-summary/insights-summary's established
 * compute-function split. Takes only `uid`; there is no second parameter
 * to accidentally wire up to a client-supplied identifier later.
 */
export async function computeMyJoinRequestStatus(db: Firestore, uid: string) {
  const snap = await db.collection('unit_join_requests').doc(uid).get();

  if (!snap.exists) {
    return { status: 200 as const, body: { status: 'none' as const } };
  }

  const data = snap.data() as { tenantId: string; unitId: string; status: string };
  return {
    status: 200 as const,
    body: {
      status: data.status,
      tenantId: data.tenantId,
      unitId: data.unitId,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
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

    const db = getAdminDb();
    const result = await computeMyJoinRequestStatus(db, uid);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/join-requests/me] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
