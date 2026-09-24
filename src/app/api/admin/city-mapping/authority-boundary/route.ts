import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runBackfillAuthorityBoundary } from '../../../../../../scripts/backfill-authority-boundary';

// 90s, not the 60s ceiling most sibling routes use — matches
// fetchCityBoundary's own `[out:json][timeout:90]` Overpass query directive
// (a regional council's boundary, with many member ways, can be slower to
// assemble than a simple amenity query).
export const maxDuration = 90;

/**
 * POST /api/admin/city-mapping/authority-boundary — thin wrapper around
 * scripts/backfill-authority-boundary.ts's `runBackfillAuthorityBoundary()`
 * (city-mapping-orchestrator.ts's "authorityBoundary" step, inserted
 * between authorityPreflight and routesGate).
 *
 * Body: { city: string, adminRelationId: number, apply: boolean }. Same
 * required-adminRelationId contract as amenities-ingest's route — no safe
 * generic default, reusing another city's relation id would corrupt its
 * authority's boundary.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const adminRelationId = Number(body.adminRelationId);
  const apply = body.apply === true;
  if (!city) return NextResponse.json({ error: 'city is required' }, { status: 400 });
  if (!Number.isFinite(adminRelationId)) {
    return NextResponse.json({ error: 'adminRelationId (numeric OSM admin_level=8 relation id) is required' }, { status: 400 });
  }

  const db = getAdminDb();
  try {
    const result = await runBackfillAuthorityBoundary({ city, adminRelationId, apply, db });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'authority boundary backfill failed' }, { status: 500 });
  }
}
