/**
 * city-inventory-health.ts — client loader for the "map health" card on
 * /admin/city-mapping (RC4 wave I2).
 *
 * Reads ONLY through GET /api/admin/city-mapping/inventory (Admin SDK on the
 * server). `city_inventory/**` is locked from every client in
 * firestore.rules, so there is deliberately no Firestore client query here.
 * The browser's admin session cookie authenticates the call (same as the
 * other city-mapping routes, see city-mapping-orchestrator.ts).
 *
 * The JSON carries dates as ISO strings; the I0 readers (`readCityInventoryDoc`
 * / `readCityInventoryRunDoc`) accept those and re-guard every field, so the
 * card never trusts the wire shape.
 */
import { readCityInventoryDoc, readCityInventoryRunDoc } from '@/lib/city-inventory/doc';
import type { CityInventory, CityInventoryRun } from '@/lib/city-inventory/types';
import { parseCityOverviewRow, type CityOverviewRow } from '@/lib/city-inventory/overview';

export interface CityInventoryHealth {
  authorityId: string;
  /** `null` = no inventory doc for this authority yet (not "everything is 0"). */
  inventory: CityInventory | null;
  /** Newest first. */
  runs: CityInventoryRun[];
}

export class CityInventoryHealthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CityInventoryHealthError';
  }
}

export function parseCityInventoryHealth(authorityId: string, json: unknown): CityInventoryHealth {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const inventory = o.inventory ? readCityInventoryDoc(authorityId, o.inventory) : null;
  const runs = (Array.isArray(o.runs) ? o.runs : [])
    .map((r) => readCityInventoryRunDoc('', r))
    .filter((r): r is CityInventoryRun => r !== null && r.runId !== '');
  return { authorityId, inventory, runs };
}

export async function loadCityInventoryHealth(
  authorityId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CityInventoryHealth> {
  const id = authorityId.trim();
  if (!id) throw new CityInventoryHealthError('authorityId is required', 400);
  const res = await fetchImpl(`/api/admin/city-mapping/inventory?authorityId=${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new CityInventoryHealthError(msg, res.status);
  }
  return parseCityInventoryHealth(id, json);
}

// ── All cities (RC8 step 5) ────────────────────────────────────────────────

/** Every city_inventory doc as one overview row — GET /api/admin/city-mapping/inventory/all (Admin SDK). */
export async function loadCityInventoryOverview(fetchImpl: typeof fetch = fetch): Promise<CityOverviewRow[]> {
  const res = await fetchImpl('/api/admin/city-mapping/inventory/all', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new CityInventoryHealthError((json as { error?: string })?.error ?? `HTTP ${res.status}`, res.status);
  const rows = Array.isArray((json as { rows?: unknown }).rows) ? (json as { rows: unknown[] }).rows : [];
  return rows.map(parseCityOverviewRow).filter((r): r is CityOverviewRow => r !== null);
}
