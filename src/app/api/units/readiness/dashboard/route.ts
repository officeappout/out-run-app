/**
 * GET /api/units/readiness/dashboard — brigade-wide readiness
 * statistics (Stage 4, 03.10.2026). Thin handler, same shape as every
 * other route in this build — see
 * readiness-dashboard.service.ts#computeBrigadeDashboard for the real
 * logic and the five locked display rules. Read-only; no write path
 * exists on this route at all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeBrigadeDashboard } from '@/features/readiness/core/services/readiness-dashboard.service';
import { logReadinessInternalError } from '@/features/readiness/core/services/readiness-error-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const scope = await resolveUnitPermissionScope(uid);
    const db = getAdminDb();
    const query = {
      tenantId: request.nextUrl.searchParams.get('tenantId'),
      unitId: request.nextUrl.searchParams.get('unitId'),
    };
    const result = await computeBrigadeDashboard(db, scope, query);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/dashboard', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
