/**
 * ⚠️ SUPERSEDED 04.10.2026 (00-MASTER-PLAN.md §13.83) — the admin panel
 * UI (/admin/authority/readiness/import) now calls
 * /api/units/readiness/results/bulk-import instead (same creates-
 * soldiers behavior when every result column is left empty, plus
 * optional results in the same call). No remaining caller from the
 * panel as of this date. The underlying function,
 * computeBulkCreateSoldiers, is untouched and still fully correct —
 * this route is deliberately NOT deleted yet (David: this is the
 * rollback if something breaks in production) — kept for one week of
 * real usage before a separate deletion round.
 */

/**
 * POST /api/units/readiness/soldiers/bulk — atomic bulk-import of
 * readiness soldier records into one unit (Stage 5, 03.10.2026).
 * Thin handler, same shape as every other route in this build — see
 * readiness-write.service.ts#computeBulkCreateSoldiers for the real
 * logic, the atomicity guarantee (single WriteBatch), and the 300-row
 * cap. No new write path — this calls the same compute* chokepoint
 * pattern as /api/units/readiness/soldiers (single-create).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeBulkCreateSoldiers } from '@/features/readiness/core/services/readiness-write.service';
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

    const result = await computeBulkCreateSoldiers(db, scope, body, { callerUid: uid, tokenEmail, sourceIp });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/soldiers/bulk', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
