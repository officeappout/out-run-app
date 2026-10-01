/**
 * POST /api/admin/contributions/[contributionId]/approve — Stage 4 of the
 * parks permission-model rebuild (01.10.2026, 00-MASTER-PLAN.md §13.58).
 * See contribution-write.service.ts for the full rationale and the
 * compute*() function this route wraps.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, resolveIdentity } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import {
  resolveContributionWriteCaller,
  computeContributionApprove,
} from '@/features/parks/core/services/contribution-write.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractSourceIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return 'unknown';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contributionId: string } },
) {
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

    const rateLimited = await isRateLimited(db, `contribution-write:${identity.uid}`, RATE_LIMITS.contributionWrite.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    let requestBody: Record<string, unknown> = {};
    try {
      const text = await request.text();
      requestBody = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const caller = await resolveContributionWriteCaller(db, identity.uid, identity.admin, identity.scope);
    const result = await computeContributionApprove(db, caller, params.contributionId, requestBody, {
      tokenEmail: identity.email ?? undefined,
      sourceIp: extractSourceIp(request),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/admin/contributions/[id]/approve POST] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
