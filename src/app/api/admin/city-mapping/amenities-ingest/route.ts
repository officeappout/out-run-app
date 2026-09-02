import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runExtractOsmAmenities } from '../../../../../../scripts/extract-osm-amenities-tlv';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/amenities-ingest — thin wrapper around
 * scripts/extract-osm-amenities-tlv.ts's `runExtractOsmAmenities()`
 * (Phase 1 Stage B, city-mapping-orchestrator.ts's "amenitiesIngest" step).
 *
 * Body: { city: string, adminRelationId: number, apply: boolean }.
 * `adminRelationId` has no safe generic default (see that script's own
 * header — reusing another city's relation id to boundary-clip would
 * corrupt its data), so it's required here, not defaulted to TLV's.
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
    const result = await runExtractOsmAmenities({ city, adminRelationId, apply, db });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'amenities ingest failed' }, { status: 500 });
  }
}
