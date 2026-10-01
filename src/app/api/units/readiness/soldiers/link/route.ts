/**
 * POST /api/units/readiness/soldiers/link — link an existing readiness
 * soldier record to a pending self-declared user account. No invite code
 * (point 4) — the officer picks both sides explicitly. Transactionally
 * enforces both uniqueness rules from point 7 — see
 * readiness-write.service.ts#computeLinkSoldier.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeLinkSoldier } from '@/features/readiness/core/services/readiness-write.service';

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

    const result = await computeLinkSoldier(db, scope, body, { callerUid: uid, tokenEmail, sourceIp });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/readiness/soldiers/link] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
