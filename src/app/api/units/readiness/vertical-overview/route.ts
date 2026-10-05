/**
 * GET /api/units/readiness/vertical-overview — "chief fitness officer"
 * cross-brigade list (06.10.2026). Read-only; no write path exists on
 * this route, and never will — see readiness-vertical-overview.service.ts's
 * own header for why that's true by construction, not by omission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeReadinessVerticalOverview } from '@/features/readiness/core/services/readiness-vertical-overview.service';
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
    const result = await computeReadinessVerticalOverview(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/vertical-overview', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
