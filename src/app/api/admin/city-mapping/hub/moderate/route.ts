import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi, resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { hubFlagDenied } from '@/lib/city-mapping-hub/gate.server';
import { moderateAmenities, parseModerateRequest } from '@/lib/city-mapping-hub/moderate-amenities.server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/city-mapping/hub/moderate — approve / reject PENDING
 * osm_amenities of ONE authority from the hub map (single or bulk ≤ 500).
 * requireSuperAdminApi → a PERSON (the agent key cannot moderate: reviewedBy
 * must be a real uid) → enable_city_mapping_hub (403 off) → body validated →
 * Admin SDK, scoped writes (see moderate-amenities.server.ts).
 *
 * Body: { authorityId, action: 'approve' | 'reject', ids: string[], reason? }
 * 200 { updated: string[], skipped: [{ id, reason }] }
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const uid = await resolveAdminUid(request);
  if (!uid) return NextResponse.json({ error: 'a signed-in admin must moderate (no agent key)' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const parsed = parseModerateRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = getAdminDb();
  const off = await hubFlagDenied(db);
  if (off) return off;
  try {
    return NextResponse.json(await moderateAmenities(db, uid, parsed.value));
  } catch (err) {
    console.error('[city-mapping/hub/moderate] failed', err);
    return NextResponse.json({ error: 'moderation failed — nothing was written' }, { status: 500 });
  }
}
