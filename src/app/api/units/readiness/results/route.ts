/**
 * POST /api/units/readiness/results — record a readiness ("מד כשירות")
 * test result for one soldier record.
 *
 * Same server-write-chokepoint shape as /api/units/member-workouts
 * (src/lib/unitPermissionScope.ts's resolveUnitPermissionScope/
 * isMemberWithinScope — reused verbatim, nothing reinvented) and the same
 * compute*()/thin-handler split as park-write.service.ts — see
 * readiness-write.service.ts's own header comment for the full 13-point
 * spec this implements.
 *
 * 'כשיר'/'לא כשיר' is always computed server-side from a raw measured
 * `value`; this body has no `outcome`/`status` field the client could use
 * to claim a verdict directly.
 *
 * 04.10.2026 (§13.87, "תיקון מוצהר") — now calls
 * computeRecordResultWithCorrectionChoice, which additionally requires a
 * `choice: 'new_test' | 'correction'` field whenever this soldier
 * already has an active organized_test result for the same test. The
 * previous computeRecordResult is ⚠️ SUPERSEDED (kept, unmodified, for
 * rollback) — see its own comment in readiness-write.service.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeRecordResultWithCorrectionChoice } from '@/features/readiness/core/services/readiness-write.service';
import { logReadinessInternalError } from '@/features/readiness/core/services/readiness-error-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    let tokenEmail: string | undefined;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
      tokenEmail = decoded.email;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveUnitPermissionScope(uid);
    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const sourceIp = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

    const result = await computeRecordResultWithCorrectionChoice(db, scope, body, { callerUid: uid, tokenEmail, sourceIp });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/results', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
