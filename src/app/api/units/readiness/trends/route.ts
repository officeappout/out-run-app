/**
 * GET /api/units/readiness/trends — the trends screen (05.10.2026,
 * §13.90): official-test status vs. app-derived workout readiness over
 * time. Thin handler, same shape as every other route in this build —
 * see readiness-trends.service.ts#computeReadinessTrends for the real
 * logic. Read-only; no write path exists on this route at all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeReadinessTrends, type ComponentFilter, type PopulationFilter } from '@/features/readiness/core/services/readiness-trends.service';
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
    const params = request.nextUrl.searchParams;
    const componentFilterRaw = params.get('componentFilter');
    const populationFilterRaw = params.get('populationFilter');
    const query = {
      tenantId: params.get('tenantId'),
      unitId: params.get('unitId'),
      componentFilter: (componentFilterRaw === 'run' || componentFilterRaw === 'strength' ? componentFilterRaw : 'all') as ComponentFilter,
      populationFilter: (populationFilterRaw === 'passed_previous_round' || populationFilterRaw === 'did_not_pass_previous_round' ? populationFilterRaw : 'all') as PopulationFilter,
    };
    const result = await computeReadinessTrends(db, scope, query);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/trends', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
