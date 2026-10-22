import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { readCityInventoryDoc } from '@/lib/city-inventory/doc';
import { buildCityOverviewRows, countApprovedByAuthority, normCity, type OverviewAuthority } from '@/lib/city-inventory/overview';
import type { CityInventory } from '@/lib/city-inventory/types';
import { readHubRows } from '@/lib/city-mapping-hub/read-hub-rows.server';
import { hubFlagDenied } from '@/lib/city-mapping-hub/gate.server';

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
 *
 * `?view=hub` (city-mapping hub H0, CITY-MAPPING-HUB-DESIGN.md §4.1) adds
 * `hubRows: HubRow[]` — one row per municipal AUTHORITY (not per inventory
 * doc), with pending routes / parks / contributions counts; 403 while
 * enable_city_mapping_hub is off. Without the param the response and its
 * reads are exactly as before.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const db = getAdminDb();
  const hub = request.nextUrl.searchParams.get('view') === 'hub';
  if (hub) {
    const off = await hubFlagDenied(db);
    if (off) return off;
  }
  try {
    const invSnap = await db.collection('city_inventory').get();
    const inventories = invSnap.docs
      .map((d) => readCityInventoryDoc(d.id, d.data()))
      .filter((x): x is CityInventory => x !== null);
    // Maps are built from entry lists (no Map writes in this read-only route file).
    const snaps = inventories.length
      ? await db.getAll(...inventories.map((i) => db.collection('authorities').doc(i.authorityId)), { fieldMask: ['name', 'type', 'population'] })
      : [];
    const authorities = new Map<string, OverviewAuthority>(
      snaps.filter((s) => s.exists).map((s) => {
        const a = s.data() ?? {};
        return [s.id, {
          name: typeof a.name === 'string' ? a.name : null,
          type: typeof a.type === 'string' ? a.type : null,
          population: typeof a.population === 'number' && Number.isFinite(a.population) ? a.population : null,
        }];
      }),
    );
    const published = await db.collection('official_routes').where('published', '==', true).select('authorityId', 'city').get();
    const cityToAuthority = new Map<string, string>(
      inventories.flatMap((i) => {
        const n = authorities.get(i.authorityId)?.name;
        const pairs: Array<[string, string]> = [[normCity(i.city), i.authorityId]];
        if (n) pairs.push([normCity(n), i.authorityId]);
        return pairs;
      }),
    );
    const approved = countApprovedByAuthority(published.docs.map((d) => d.data()), cityToAuthority);
    const rows = buildCityOverviewRows(inventories, authorities, approved);
    if (!hub) return NextResponse.json({ rows });
    const hubRows = await readHubRows(db, inventories, published.docs.map((d) => d.data()));
    return NextResponse.json({ rows, hubRows });
  } catch (err) {
    console.error('[city-mapping/inventory/all] read failed', err);
    return NextResponse.json({ error: 'city inventory overview read failed' }, { status: 500 });
  }
}
