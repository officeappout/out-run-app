import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { readCityInventoryDoc } from '@/lib/city-inventory/doc';
import { buildCityOverviewRows, countApprovedByAuthority, normCity, type OverviewAuthority } from '@/lib/city-inventory/overview';
import type { CityInventory } from '@/lib/city-inventory/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/city-mapping/inventory/all — RC8 step 5.
 * Read-only "all cities" table on /admin/city-mapping: one row per
 * `city_inventory` doc + the authority's quota (type/population) + its
 * approved (published) route count.
 *
 * Admin SDK only, same gate as the I2 per-city route (requireSuperAdminApi):
 * `city_inventory/**` is locked from every client in firestore.rules, so the
 * browser never queries it (axioms §25). No rules change. Nothing here writes.
 *
 * 200 { rows: CityOverviewRow[] } — dates as ISO strings.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const db = getAdminDb();
  try {
    const invSnap = await db.collection('city_inventory').get();
    const inventories = invSnap.docs
      .map((d) => readCityInventoryDoc(d.id, d.data()))
      .filter((x): x is CityInventory => x !== null);
    const authorities = new Map<string, OverviewAuthority>();
    if (inventories.length) {
      const refs = inventories.map((i) => db.collection('authorities').doc(i.authorityId));
      const snaps = await db.getAll(...refs, { fieldMask: ['name', 'type', 'population'] });
      for (const s of snaps) {
        if (!s.exists) continue;
        const a = s.data() ?? {};
        authorities.set(s.id, {
          name: typeof a.name === 'string' ? a.name : null,
          type: typeof a.type === 'string' ? a.type : null,
          population: typeof a.population === 'number' && Number.isFinite(a.population) ? a.population : null,
        });
      }
    }
    const published = await db.collection('official_routes').where('published', '==', true).select('authorityId', 'city').get();
    const cityToAuthority = new Map<string, string>();
    for (const i of inventories) {
      cityToAuthority.set(normCity(i.city), i.authorityId);
      const n = authorities.get(i.authorityId)?.name;
      if (n) cityToAuthority.set(normCity(n), i.authorityId);
    }
    const approved = countApprovedByAuthority(published.docs.map((d) => d.data()), cityToAuthority);
    return NextResponse.json({ rows: buildCityOverviewRows(inventories, authorities, approved) });
  } catch (err) {
    console.error('[city-mapping/inventory/all] read failed', err);
    return NextResponse.json({ error: 'city inventory overview read failed' }, { status: 500 });
  }
}
