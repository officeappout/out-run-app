/**
 * city-mapping-hub.service.ts — client loaders for /admin/city-mapping/hub
 * (CITY-MAPPING-HUB-DESIGN.md). Every read goes through a guarded server route
 * (requireSuperAdminApi + the enable_city_mapping_hub gate, Admin SDK) — no
 * client Firestore query on city_inventory / osm_amenities / route_scores
 * (axioms §25). The admin session cookie authenticates the call, same as the
 * other city-mapping loaders (city-inventory-health.ts).
 */
import { parseHubRow, type HubRow } from '@/lib/city-mapping-hub/rows';
import { parseLayerPayload, type HubLayerPayload } from '@/lib/city-mapping-hub/layer-payload';
import type { HubFetchLayer } from '@/lib/city-mapping-hub/layers';

export class CityMappingHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CityMappingHubError';
  }
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new CityMappingHubError(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`, res.status);
  return json;
}

/** One row per municipal authority — GET /api/admin/city-mapping/inventory/all?view=hub. */
export async function loadHubRows(fetchImpl: typeof fetch = fetch): Promise<HubRow[]> {
  const json = await getJson('/api/admin/city-mapping/inventory/all?view=hub', fetchImpl);
  const rows = Array.isArray(json.hubRows) ? json.hubRows : [];
  return rows.map(parseHubRow).filter((r): r is HubRow => r !== null);
}

/** One map layer of one authority — GET /api/admin/city-mapping/hub/layers (Admin SDK on the server). */
export async function loadHubLayer(authorityId: string, layer: HubFetchLayer, fetchImpl: typeof fetch = fetch): Promise<HubLayerPayload> {
  const qs = new URLSearchParams({ authorityId, layer }).toString();
  return parseLayerPayload(await getJson(`/api/admin/city-mapping/hub/layers?${qs}`, fetchImpl));
}
