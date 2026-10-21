/**
 * city-inventory/types.ts — per-authority map inventory (RC4, wave I0).
 *
 * One small summary document per authority: `city_inventory/{authorityId}`,
 * plus a history row per refresh: `city_inventory/{authorityId}/runs/{runId}`.
 * Heavy geometry lives in Storage files, never here
 * (docs/routes/CITY-MAPPING-PLAN.md §3.1-3.3).
 *
 * Pure types. No firebase imports: timestamps are plain `Date` in the
 * domain model; the doc builder/reader (doc.ts) handles the Firestore shape.
 */

export const CITY_INVENTORY_COLLECTION = 'city_inventory';
export const CITY_INVENTORY_RUNS_SUBCOLLECTION = 'runs';
/** Bump when the stored shape changes incompatibly. */
export const CITY_INVENTORY_SCHEMA_VERSION = 1;

/** Every inventory layer. Order = display order in the panel card. */
export const INVENTORY_LAYER_KEYS = [
  'parks',
  'big_parks',
  /** Small gardens/parks with a walkable perimeter ≥ 500 m (owner, 21.10.2026). */
  'lap_loops',
  'courts',
  'fitness_stations',
  'benches',
  'drinking_water',
  'toilets',
  'major_roads',
  'crossings',
  'bike_paved',
  'bike_offroad',
  'trails_paved',
  'trails_offroad',
  'promenades',
  'lighting',
  'shade',
] as const;

export type InventoryLayerKey = (typeof INVENTORY_LAYER_KEYS)[number];

/** Point layers: coverage is density vs. peer cities (plan §3.4). */
export const POINT_LAYER_KEYS = ['benches', 'drinking_water', 'toilets'] as const satisfies readonly InventoryLayerKey[];

/** Layers measured from OSM alone — all must be measured for yellow (plan §6.2). */
export const OSM_LAYER_KEYS = [
  'parks',
  'big_parks',
  'lap_loops',
  'courts',
  'fitness_stations',
  'benches',
  'drinking_water',
  'toilets',
  'major_roads',
  'crossings',
  'bike_paved',
  'bike_offroad',
  'trails_paved',
  'trails_offroad',
  'promenades',
  'lighting',
] as const satisfies readonly InventoryLayerKey[];

export type AuthorityType = 'city' | 'local_council' | 'regional_council';

export type QualityFlag =
  | 'below_expected_density'
  | 'single_source'
  | 'stale_source'
  | 'untagged_majority'
  | 'license_pending';

/**
 * How a layer's value was computed. Shade especially: the Technion daily
 * summer Shade Index and our canopy-% estimate are NOT comparable numbers,
 * so the method always travels with the value (plan §2.4, TECHNION-SHADE-IMPORT §3).
 */
export type LayerMethod =
  | 'osm_count'
  | 'osm_tag_coverage'
  | 'osm_density_vs_peers'
  | 'technion_si_daily'
  | 'canopy_estimate';

export interface LayerSource {
  /** Stable key, e.g. `osm`, `technion_shade`, `canopy_estimate`. */
  key: string;
  license: string;
  attribution: string;
  /** ISO date (YYYY-MM-DD) of the source snapshot. Required for green. */
  snapshotDate: string;
  count: number;
}

export interface LayerFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface InventoryLayer {
  /** Points / polygons / ways. `null` = not measured (never "zero"). */
  count: number | null;
  lengthKm: number | null;
  areaKm2: number | null;
  /** Per km of street (points) — see coverage.ts. */
  density: number | null;
  /** 0..100. `null` = not measured (never "zero"). */
  coveragePct: number | null;
  method: LayerMethod | null;
  sources: LayerSource[];
  quality: QualityFlag[];
  /** Storage geometry files. Kept on the summary doc only, not on runs. */
  files: LayerFile[];
  lastRefreshAt: Date | null;
}

export type ReadinessLevel = 'red' | 'yellow' | 'green';

export interface Readiness {
  score: number;
  level: ReadinessLevel;
  missing: InventoryLayerKey[];
  /** Human-readable reasons the next level is not reached (admin card). */
  blockers: string[];
}

export interface InventorySnapshot {
  /** ISO date of the OSM PBF snapshot the run used. */
  osmPbfDate: string;
  builtAt: Date;
  builtBy: string;
  runId: string;
}

export interface CityInventory {
  authorityId: string;
  /** Canonical city-mapping city string. */
  city: string;
  authorityType: AuthorityType;
  areaKm2: number | null;
  snapshot: InventorySnapshot;
  layers: Record<InventoryLayerKey, InventoryLayer>;
  readiness: Readiness;
  schemaVersion: number;
  /** Read side only (server timestamp); `null` before the first write lands. */
  updatedAt: Date | null;
}

/** History row: same layers, without Storage file lists. */
export interface CityInventoryRun {
  authorityId: string;
  runId: string;
  snapshot: InventorySnapshot;
  layers: Record<InventoryLayerKey, Omit<InventoryLayer, 'files'>>;
  readiness: Readiness;
  schemaVersion: number;
  createdAt: Date | null;
}

/** Minimal OSM tag bag (same shape as trail-graph `Tags`). */
export type OsmTags = Record<string, string>;
