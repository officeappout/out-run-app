/**
 * GET /api/admin/demo/status — everything /admin/demo shows: the three switches (raw
 * stored values), demo population, tester run state, caps + price table, today's and
 * month-to-date usage. Super admin only. Bounded reads (see demo-control.server.ts).
 * The page polls this while it is visible — demo_registry is closed to the client SDK.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { loadDemoStatus } from '@/lib/demo-control/demo-control.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadDemoStatus(getAdminDb()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[/api/admin/demo/status] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
