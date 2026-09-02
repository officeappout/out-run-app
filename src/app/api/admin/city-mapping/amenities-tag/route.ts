import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runTagRouteAmenities } from '../../../../../../scripts/tag-route-amenities';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/amenities-tag — thin wrapper around
 * scripts/tag-route-amenities.ts's `runTagRouteAmenities()` (Phase 1 Stage
 * B, city-mapping-orchestrator.ts's "amenitiesTagging" step). Shipped
 * separately, already applied to Haifa (Phase 3, 01.09.2026) — this route
 * exposes the same, unchanged join logic to the orchestrator.
 *
 * Body: { city: string, apply: boolean }.
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
    const result = await runTagRouteAmenities({ city, apply, db });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'amenities tagging failed' }, { status: 500 });
  }
}
