import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { hubFlagDenied } from '@/lib/city-mapping-hub/gate.server';
import { isHubFetchLayer } from '@/lib/city-mapping-hub/layers';
import { validAuthorityId } from '@/lib/city-mapping-hub/url-state';
import { readAuthorityNames, readHubLayer } from '@/lib/city-mapping-hub/layers.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/city-mapping/hub/layers?authorityId=<id>&layer=<key>
 * — one map layer of one authority as GeoJSON (CITY-MAPPING-HUB-DESIGN.md §4.2).
 *
 * requireSuperAdminApi (same gate as every city-mapping route) → the
 * enable_city_mapping_hub flag (403 while off) → `authorityId` (non-empty,
 * ≤ 128, no `/`) and `layer` (closed list) validated → Admin SDK reads only.
 * No client Firestore query on these collections (axioms §25). Read-only.
 *
 * 200 { authorityId, layer, featureCollection, truncated, total }
 * 404 when the authority has neither an authorities doc nor an inventory doc.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const authorityId = validAuthorityId(sp.get('authorityId'));
  const layer = sp.get('layer');
  if (!authorityId) return NextResponse.json({ error: 'invalid authorityId' }, { status: 400 });
  if (!isHubFetchLayer(layer)) return NextResponse.json({ error: 'unknown layer' }, { status: 400 });
  const db = getAdminDb();
  const off = await hubFlagDenied(db);
  if (off) return off;
  try {
    const { exists, names } = await readAuthorityNames(db, authorityId);
    if (!exists) return NextResponse.json({ error: 'authority not found' }, { status: 404 });
    const payload = await readHubLayer(db, authorityId, layer, names);
    return NextResponse.json({ authorityId, layer, ...payload }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[city-mapping/hub/layers] read failed', layer, err);
    return NextResponse.json({ error: 'layer read failed' }, { status: 500 });
  }
}
