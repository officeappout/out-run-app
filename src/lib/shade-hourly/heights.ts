/**
 * Obstacle heights when the source does not carry a measured one.
 *
 * Every default is a named constant so the build report can say exactly
 * which share of the city's shadows rests on an assumption. Pure.
 */

/** Metres per storey when only `building:levels` / floors is known. */
export const LEVEL_HEIGHT_M = 3.2;
/** Building with no height and no levels — a typical 3-storey Israeli city block. */
export const DEFAULT_BUILDING_HEIGHT_M = 10;
/** Tree crown top when no canopy-height source covers it (Meta CHM etc.). */
export const DEFAULT_TREE_HEIGHT_M = 7;
/**
 * Share of direct sun a tree crown blocks. Dense street trees transmit
 * roughly 10–25% of direct radiation in summer; 0.85 is the mid value.
 * Buildings are opaque (1).
 */
export const TREE_CANOPY_OPACITY = 0.85;

/** Default heights by OSM `building=*` value when nothing is tagged. */
export const BUILDING_TYPE_DEFAULT_HEIGHT_M: Readonly<Record<string, number>> = {
  house: 6.5,
  detached: 6.5,
  semidetached_house: 6.5,
  terrace: 7,
  bungalow: 4,
  hut: 3,
  shed: 3,
  garage: 3,
  garages: 3,
  carport: 3,
  roof: 4,
  kiosk: 3,
  service: 4,
  transformer_tower: 6,
  apartments: 13,
  residential: 12,
  commercial: 12,
  office: 15,
  retail: 6,
  industrial: 8,
  warehouse: 8,
  school: 10,
  hospital: 18,
  synagogue: 9,
  mosque: 9,
  church: 12,
  hotel: 25,
};

export type HeightSource = 'height' | 'levels' | 'type_default' | 'default';

export interface HeightInput {
  /** Measured height in metres (OSM `height`, municipal max_height, Overture `height`). */
  heightM?: number | string | null;
  /** Storeys (OSM `building:levels`, municipal floors). */
  levels?: number | string | null;
  /** OSM `building=*` value. */
  buildingType?: string | null;
}

/** Parse "12", "12 m", "12.5m", "40'" (feet) → metres, or null. */
export function parseHeightM(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = v.trim().toLowerCase();
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(m|meters?|metres?|ft|'|feet)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const feet = m[2] === 'ft' || m[2] === "'" || m[2] === 'feet';
  return feet ? n * 0.3048 : n;
}

function parseLevels(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 200 ? n : null;
}

/** Best height for a building and which rule produced it. Heights are clamped to 1…400 m. */
export function resolveBuildingHeight(input: HeightInput): { heightM: number; source: HeightSource } {
  const clamp = (h: number) => Math.max(1, Math.min(400, h));
  const h = parseHeightM(input.heightM);
  if (h != null) return { heightM: clamp(h), source: 'height' };
  const lv = parseLevels(input.levels);
  if (lv != null) return { heightM: clamp(lv * LEVEL_HEIGHT_M), source: 'levels' };
  const t = input.buildingType ? BUILDING_TYPE_DEFAULT_HEIGHT_M[input.buildingType] : undefined;
  if (t != null) return { heightM: t, source: 'type_default' };
  return { heightM: DEFAULT_BUILDING_HEIGHT_M, source: 'default' };
}
