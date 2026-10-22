import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { hubFlagDenied } from '@/lib/city-mapping-hub/gate.server';
import { approvePendingRoutes, parseBulkApproveRequest, readPendingRoutesNationwide } from '@/lib/city-mapping-hub/bulk-routes.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nationwide bulk approve of PENDING official_routes from the hub.
 * Both verbs: requireSuperAdminApi → enable_city_mapping_hub (403 off).
 *
 * GET  → { candidates, authorityNames, unattributed } (read-only preview data)
 * POST { authorityId, ids ≤ 500 } → { updated, skipped } — one authority per
 *   call; a real signed-in uid is required (reviewedBy / audit), never the
 *   agent key. Only docs still pending + unpublished are written.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const db = getAdminDb();
  const off = await hubFlagDenied(db);
  if (off) return off;
  try {
    return NextResponse.json(await readPendingRoutesNationwide(db));
  } catch (err) {
    console.error('[city-mapping/hub/bulk-routes] read failed', err);
    return NextResponse.json({ error: 'failed to read pending routes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'a signed-in admin must approve (no agent key)' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = parseBulkApproveRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = getAdminDb();
  const off = await hubFlagDenied(db);
  if (off) return off;
  try {
    return NextResponse.json(await approvePendingRoutes(db, uid, parsed.value));
  } catch (err) {
    console.error('[city-mapping/hub/bulk-routes] approve failed', err);
    return NextResponse.json({ error: 'approval failed — nothing was written for this batch' }, { status: 500 });
  }
}
