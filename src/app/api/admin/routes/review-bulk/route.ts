import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  approvePendingRoutes, parseBulkApproveRequest, parseBulkRejectRequest, readPendingRoutesNationwide, rejectPendingRoutes,
} from '@/lib/city-mapping-hub/bulk-routes.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Approval center — routes tab review filters + filtered bulk actions (owner 24.10.2026).
 * Super admin only (requireSuperAdminApi); same server half as the hub's nationwide bulk
 * approve (src/lib/city-mapping-hub/bulk-routes.server.ts), not gated by the hub flag.
 *
 * GET  → { candidates, authorityNames, unattributed }: every pending route with its score /
 *        lowConfidenceReason (route_scores), authority kind and geometry verdict — Admin SDK,
 *        so no browser query against route_scores (axioms §25).
 * POST { action: 'approve' | 'reject', authorityId, ids ≤ 499, filter, reason? } → { updated, skipped }
 *        One authority per call. The server re-checks ownership, pending, the confirmed filter
 *        and (approve) the straight-bridge guard at write time; updateTime preconditions.
 *        A real signed-in uid is required (reviewedBy / audit), never the agent key.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await readPendingRoutesNationwide(getAdminDb()));
  } catch (err) {
    console.error('[routes/review-bulk] read failed', err);
    return NextResponse.json({ error: 'failed to read pending routes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'a signed-in admin must moderate (no agent key)' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const action = (body as { action?: unknown } | null)?.action;
  const db = getAdminDb();
  try {
    if (action === 'approve') {
      const parsed = parseBulkApproveRequest(body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      if (!parsed.value.filter) return NextResponse.json({ error: 'filter is required' }, { status: 400 });
      return NextResponse.json(await approvePendingRoutes(db, uid, parsed.value));
    }
    if (action === 'reject') {
      const parsed = parseBulkRejectRequest(body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      return NextResponse.json(await rejectPendingRoutes(db, uid, parsed.value));
    }
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  } catch (err) {
    console.error('[routes/review-bulk] write failed', err);
    return NextResponse.json({ error: 'the action failed — nothing was written for this batch' }, { status: 500 });
  }
}
