/**
 * GET/PUT /api/units/readiness/thresholds — the single global readiness
 * threshold config (point 1: one threshold for the whole military
 * vertical, no per-tenant/per-unit override). GET is readable by any
 * resolved officer scope (root/tenantOwner/unitAdmin); PUT is root-only
 * (David's "סף אחד... גלובלי" reading — see
 * readiness-write.service.ts#computeSetThresholds's own note on this
 * design call).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope } from '@/lib/unitPermissionScope';
import { computeGetThresholds, computeSetThresholds } from '@/features/readiness/core/services/readiness-write.service';
import { logReadinessInternalError } from '@/features/readiness/core/services/readiness-error-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveCaller(request: NextRequest) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return { error: NextResponse.json({ error: 'Missing auth token' }, { status: 401 }) } as const;

  const adminAuth = getAdminAuth();
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    return { uid: decoded.uid, tokenEmail: decoded.email } as const;
  } catch {
    return { error: NextResponse.json({ error: 'Invalid auth token' }, { status: 401 }) } as const;
  }
}

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveCaller(request);
    if ('error' in caller) return caller.error;

    const scope = await resolveUnitPermissionScope(caller.uid);
    const db = getAdminDb();
    const result = await computeGetThresholds(db, scope);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/thresholds GET', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const caller = await resolveCaller(request);
    if ('error' in caller) return caller.error;

    const scope = await resolveUnitPermissionScope(caller.uid);
    const db = getAdminDb();
    const body = await request.json().catch(() => ({}));
    const sourceIp = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

    const result = await computeSetThresholds(db, scope, body, { callerUid: caller.uid, tokenEmail: caller.tokenEmail, sourceIp });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    const errorId = logReadinessInternalError('/api/units/readiness/thresholds PUT', err);
    return NextResponse.json({ error: `שגיאה פנימית. קוד: ${errorId}`, errorId }, { status: 500 });
  }
}
