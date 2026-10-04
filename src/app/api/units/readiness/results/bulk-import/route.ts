/**
 * POST /api/units/readiness/results/bulk-import — atomic bulk-import of
 * readiness results (paste or file upload), two explicit modes
 * (00-MASTER-PLAN.md §13.83). Thin handler, same shape as every other
 * route in this build — see
 * readiness-write.service.ts#computeBulkImportResults for the real
 * logic, the atomicity guarantee (single WriteBatch), and the 100-row
 * cap.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeBulkImportResults } from '@/features/readiness/core/services/readiness-write.service';
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

    const result = await computeBulkImportResults(db, scope, body, { callerUid: uid, tokenEmail, sourceIp });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/results/bulk-import', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
