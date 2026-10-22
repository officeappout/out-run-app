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

export const HUB_FETCH_LAYERS = ['boundary', 'routes', 'parks', 'fitness', 'courts', 'benches', 'water', 'crossings', 'contributions'] as const;
export type HubFetchLayer = (typeof HUB_FETCH_LAYERS)[number];

export const HUB_CHIP_LAYERS = [
  'routes_approved', 'routes_pending', 'parks', 'fitness', 'courts', 'benches', 'water', 'crossings', 'contributions',
] as const;
export type HubChipLayer = (typeof HUB_CHIP_LAYERS)[number];

export const DEFAULT_CHIP_LAYERS: readonly HubChipLayer[] = ['routes_approved', 'routes_pending', 'parks', 'fitness', 'contributions'];

export const CHIP_FETCH: Record<HubChipLayer, HubFetchLayer> = {
  routes_approved: 'routes',
  routes_pending: 'routes',
  parks: 'parks',
  fitness: 'fitness',
  courts: 'courts',
  benches: 'benches',
  water: 'water',
  crossings: 'crossings',
  contributions: 'contributions',
};

/** Point fetch layers backed by osm_amenities, and their `category`. */
export const AMENITY_LAYER_CATEGORY = {
  fitness: 'fitness_station',
  courts: 'court',
  benches: 'bench',
  water: 'drinking_water',
  crossings: 'crossing',
} as const satisfies Partial<Record<HubFetchLayer, string>>;
export type AmenityFetchLayer = keyof typeof AMENITY_LAYER_CATEGORY;

export const POINT_FETCH_LAYERS = ['parks', 'fitness', 'courts', 'benches', 'water', 'crossings', 'contributions'] as const satisfies readonly HubFetchLayer[];
export type PointFetchLayer = (typeof POINT_FETCH_LAYERS)[number];

/** Panel lists (contributions, parks) are loaded whenever an authority is selected, chip or not. */
export const PANEL_FETCH_LAYERS: readonly HubFetchLayer[] = ['parks', 'contributions'];

export interface HubChipDef {
  key: HubChipLayer;
  group: string;
  label: string;
  color: string;
}

export const HUB_CHIPS: readonly HubChipDef[] = [
  { key: 'routes_approved', group: 'מסלולים', label: 'מאושרים', color: '#06b6d4' },
  { key: 'routes_pending', group: 'מסלולים', label: 'ממתינים', color: '#f97316' },
  { key: 'parks', group: 'כושר', label: 'פארקים', color: '#16a34a' },
  { key: 'fitness', group: 'כושר', label: 'מתקני כושר', color: '#0891b2' },
  { key: 'courts', group: 'כושר', label: 'מגרשים', color: '#6366f1' },
  { key: 'benches', group: 'נוחות', label: 'ספסלים', color: '#a16207' },
  { key: 'water', group: 'נוחות', label: 'ברזיות', color: '#3b82f6' },
  { key: 'crossings', group: 'תנועה', label: 'מעברי חצייה', color: '#334155' },
  { key: 'contributions', group: 'קהילה', label: 'תרומות משתמשים', color: '#8b5cf6' },
];

/**
 * Layers that exist only as counts in city_inventory today — no queryable
 * geometry yet (Storage files, wave H5). Shown disabled with the reason,
 * never as an empty map that reads like "there are none" (§3.3).
 */
export const DATA_ONLY_CHIPS: ReadonlyArray<{ key: string; group: string; label: string; color: string; why: string }> = [
  { key: 'toilets', group: 'נוחות', label: 'שירותים', color: '#db2777', why: 'אין גאומטריה — רק ספירה ב-city_inventory (גל H5)' },
  { key: 'bike', group: 'תנועה', label: 'אופניים', color: '#8b5cf6', why: 'אין גאומטריה — רק ק״מ ב-city_inventory (גל H5)' },
  { key: 'lighting', group: 'סביבה', label: 'תאורה', color: '#eab308', why: 'קובץ תאורה לפי עיר ב-Storage — יוגש בגל H5' },
  { key: 'shade', group: 'סביבה', label: 'צל', color: '#15803d', why: 'קובץ צל (טכניון) ב-Storage — יוגש בגל H5' },
];

/** A hard cap per layer: more is cut and flagged `truncated` (shown as a banner, never silent). */
export const HUB_LAYER_FEATURE_CAP = 5000;

export function isHubFetchLayer(v: unknown): v is HubFetchLayer {
  return typeof v === 'string' && (HUB_FETCH_LAYERS as readonly string[]).includes(v);
}

export function isHubChipLayer(v: unknown): v is HubChipLayer {
  return typeof v === 'string' && (HUB_CHIP_LAYERS as readonly string[]).includes(v);
}

/** The fetch layers the enabled chips need (+ boundary and the panel lists whenever an authority is selected). */
export function fetchLayersFor(chips: readonly HubChipLayer[]): HubFetchLayer[] {
  const out = new Set<HubFetchLayer>(['boundary', ...PANEL_FETCH_LAYERS]);
  for (const c of chips) out.add(CHIP_FETCH[c]);
  return HUB_FETCH_LAYERS.filter((l) => out.has(l));
}
