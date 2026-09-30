/**
 * PATCH /api/admin/parks/[parkId] — edit a park. Stage 2 of the parks
 * permission-model rebuild (30.09.2026, 00-MASTER-PLAN.md §13.56). See
 * park-write.service.ts for the full rationale and the compute*()
 * functions this route wraps — in particular the ownership check
 * (existingPark.authorityId === caller's own authorityId) that a rules
 * relaxation alone could never enforce.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveIdentity } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveParkWriteCaller, computeParkUpdate } from '@/features/parks/core/services/park-write.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractSourceIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return 'unknown';
}

export async function PATCH(request: NextRequest, { params }: { params: { parkId: string } }) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let identity;
    try {
      identity = await resolveIdentity(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    const rateLimited = await isRateLimited(db, `park-write:${identity.uid}`, RATE_LIMITS.parkWrite.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    let requestBody: Record<string, unknown>;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const caller = await resolveParkWriteCaller(db, identity.uid, identity.admin, identity.scope);
    const result = await computeParkUpdate(db, caller, params.parkId, requestBody, {
      tokenEmail: identity.email ?? undefined,
      sourceIp: extractSourceIp(request),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/parks/[parkId] PATCH] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
