import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateCityRegistration, CityRegistrationValidationError } from '@/lib/city-registrations';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/register-city — Phase 1 Stage C2 (Add
 * City), final step. The ONLY write in the whole Add-City screen, gated
 * behind the operator's explicit save click after they've searched, picked
 * a candidate, and visually confirmed its boundary on the map.
 *
 * Writes to `city_registrations/{key}` — confirmed doc-ID convention
 * (matches geo-discovery-routes.ts's resolveRegion(), which reads
 * `city_registrations/{regionArg}` where regionArg is the same `--region=`
 * CLI slug). Uses `.set()` with no merge — this route is this collection's
 * only writer (confirmed zero other writers anywhere in the repo), so a
 * create/overwrite here is never clobbering another writer's data.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

  let validated;
  try {
    validated = validateCityRegistration({
      key,
      label: body.label,
      adminRelationId: body.adminRelationId,
      bbox: body.bbox,
      batchId: body.batchId ?? `${key}-registration-${new Date().toISOString().slice(0, 10)}`,
    });
  } catch (err) {
    if (err instanceof CityRegistrationValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const db = getAdminDb();
  try {
    await db.collection('city_registrations').doc(key).set(validated);
    return NextResponse.json({ success: true, key });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'city registration write failed' }, { status: 500 });
  }
}
