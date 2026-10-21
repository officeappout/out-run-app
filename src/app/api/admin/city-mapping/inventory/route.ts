import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  readCityInventory,
  readRecentCityInventoryRuns,
  type InventoryDb,
  type InventoryRunsQueryDb,
} from '@/lib/city-inventory/store';

export const dynamic = 'force-dynamic';

/** Runs shown in the card's history list. */
const CITY_INVENTORY_HISTORY_LIMIT = 5;

/**
 * GET /api/admin/city-mapping/inventory?authorityId=<id> — RC4 wave I2.
 * Read-only data for the "map health" card on /admin/city-mapping:
 * `city_inventory/{authorityId}` + its newest runs.
 *
 * Read through the Admin SDK on purpose: `city_inventory/**` is fully locked
 * from every client in firestore.rules (`allow read, write: if false`), so
 * the panel never queries it from the browser (axioms §25 — no client
 * list/query to reason about). Same gate as every other city-mapping route:
 * requireSuperAdminApi (agent key, or a super-admin Bearer token / session
 * cookie). Nothing here writes.
 *
 * 200 { authorityId, inventory: CityInventory | null, runs: CityInventoryRun[] }
 * `inventory: null` = no doc yet (never built / never applied) — the card
 * says so instead of showing zeros. Dates are ISO strings in the JSON.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const authorityId = (request.nextUrl.searchParams.get('authorityId') ?? '').trim();
  if (!authorityId || authorityId.length > 128 || authorityId.includes('/')) {
    return NextResponse.json({ error: 'authorityId is required (a single document id)' }, { status: 400 });
  }

  const db = getAdminDb();
  try {
    const [inventory, runs] = await Promise.all([
      readCityInventory(db as unknown as InventoryDb, authorityId),
      readRecentCityInventoryRuns(db as unknown as InventoryRunsQueryDb, authorityId, CITY_INVENTORY_HISTORY_LIMIT),
    ]);
    return NextResponse.json({ authorityId, inventory, runs });
  } catch (err) {
    console.error('[city-mapping/inventory] read failed', err);
    return NextResponse.json({ error: 'city inventory read failed' }, { status: 500 });
  }
}
