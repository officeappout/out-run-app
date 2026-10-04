/**
 * GET /api/units/readiness/match-suggestions — readiness-roster ↔
 * app-account match suggestions for one unit (00-MASTER-PLAN.md §13.84).
 * See readiness-match.service.ts#computeReadinessMatchSuggestions for
 * the matching rule and why this reuses computeUnitMembers's own scope
 * resolution unmodified.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeReadinessMatchSuggestions } from '@/features/readiness/core/services/readiness-match.service';
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

    // Optional — the roster screen shows the officer's whole command
    // span, not one unit at a time (ReadinessPage's own established
    // model), so omitted means "every unit in scope," matching
    // computeUnitMembers's own convention.
    const unitId = request.nextUrl.searchParams.get('unitId');
    const tenantId = request.nextUrl.searchParams.get('tenantId');

    const scope = await resolveUnitPermissionScope(uid);
    const db = getAdminDb();
    const result = await computeReadinessMatchSuggestions(db, scope, { tenantId, unitId });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/match-suggestions', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
