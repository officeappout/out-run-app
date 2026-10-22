/**
 * city-mapping-hub/layers.ts — the hub map's layers (CITY-MAPPING-HUB-DESIGN.md
 * §3.3 / §4.2). Two vocabularies:
 *   - FETCH layers: what GET /api/admin/city-mapping/hub/layers serves (one
 *     Admin-SDK read per authority per layer). Closed list — the route rejects
 *     anything else.
 *   - CHIP layers: what the admin toggles. Several chips can share one fetch
 *     (approved + pending routes are one read, split by `status`).
 * Pure.
 */

export const HUB_FETCH_LAYERS = ['boundary', 'routes'] as const;
export type HubFetchLayer = (typeof HUB_FETCH_LAYERS)[number];

export const HUB_CHIP_LAYERS = ['routes_approved', 'routes_pending'] as const;
export type HubChipLayer = (typeof HUB_CHIP_LAYERS)[number];

export const DEFAULT_CHIP_LAYERS: readonly HubChipLayer[] = ['routes_approved', 'routes_pending'];

export const CHIP_FETCH: Record<HubChipLayer, HubFetchLayer> = {
  routes_approved: 'routes',
  routes_pending: 'routes',
};

export interface HubChipDef {
  key: HubChipLayer;
  group: string;
  label: string;
  color: string;
}

export const HUB_CHIPS: readonly HubChipDef[] = [
  { key: 'routes_approved', group: 'מסלולים', label: 'מאושרים', color: '#06b6d4' },
  { key: 'routes_pending', group: 'מסלולים', label: 'ממתינים', color: '#f97316' },
];

/** A hard cap per layer: more is cut and flagged `truncated` (shown as a banner, never silent). */
export const HUB_LAYER_FEATURE_CAP = 5000;

export function isHubFetchLayer(v: unknown): v is HubFetchLayer {
  return typeof v === 'string' && (HUB_FETCH_LAYERS as readonly string[]).includes(v);
}

export function isHubChipLayer(v: unknown): v is HubChipLayer {
  return typeof v === 'string' && (HUB_CHIP_LAYERS as readonly string[]).includes(v);
}

/** The fetch layers the enabled chips need (+ boundary whenever an authority is selected). */
export function fetchLayersFor(chips: readonly HubChipLayer[]): HubFetchLayer[] {
  const out = new Set<HubFetchLayer>(['boundary']);
  for (const c of chips) out.add(CHIP_FETCH[c]);
  return HUB_FETCH_LAYERS.filter((l) => out.has(l));
}
