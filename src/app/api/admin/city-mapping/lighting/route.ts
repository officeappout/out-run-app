import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runBackfillRouteLighting } from '../../../../../../scripts/backfill-route-lighting-haifa';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/lighting — thin wrapper around
 * scripts/backfill-route-lighting-haifa.ts's `runBackfillRouteLighting()`
 * (Phase 1 Stage B, city-mapping-orchestrator.ts's "lighting" step).
 *
 * Body: { city: string, apply: boolean }. `city` is passed as the sole
 * alias — the two-spelling comma-separated form stays a CLI-only escape
 * hatch (LOCKED, city-mapping-orchestrator.ts's single-canonical-city-
 * string guard: this route accepts exactly one city string, not a list).
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const apply = body.apply === true;
  if (!city) return NextResponse.json({ error: 'city is required' }, { status: 400 });

  const db = getAdminDb();
  try {
    const result = await runBackfillRouteLighting({ cityAliases: [city], apply, db });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'lighting backfill failed' }, { status: 500 });
  }
}
