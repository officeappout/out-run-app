/**
 * city-inventory/readiness.ts — is a city's map good enough? red / yellow /
 * green + a 0..100 score (docs/routes/CITY-MAPPING-PLAN.md §6.2). Pure.
 *
 * The level is the highest one whose conditions ALL hold:
 *   red    — anything short of yellow (no boundary, no snapshot, < 3
 *            approved routes, or an OSM layer still unmeasured / below quota).
 *   yellow — boundary + OSM snapshot + every OSM layer measured + approved
 *            routes ≥ the RC3 §3.7 quota minimum for the authority's size.
 *   green  — yellow + shade measured on ≥ 80 % of walkable ways + big-park
 *            polygons measured + no point layer below expected density +
 *            every source has a snapshot date and no licence is pending.
 *
 * Thresholds are starting points for calibration after I1 (owner Q7,
 * 21.10.2026). The generator never blocks a yellow city — it just skips a
 * preference whose layer is missing.
 */
import {
  INVENTORY_LAYER_KEYS,
  OSM_LAYER_KEYS,
  POINT_LAYER_KEYS,
  type AuthorityType,
  type InventoryLayer,
  type InventoryLayerKey,
  type Readiness,
  type ReadinessLevel,
} from './types';

/** Below this many approved routes a city is red regardless of layers. */
export const RED_MIN_APPROVED_ROUTES = 3;
/** Green needs shade on at least this % of walkable ways. */
export const GREEN_MIN_SHADE_COVERAGE_PCT = 80;

/** RC3 §3.7 quota lower bounds (docs/routes/NATIONWIDE-PLAN.md). */
export const ROUTE_QUOTA_MIN_LARGE_CITY = 25;
export const ROUTE_QUOTA_MIN_MEDIUM_CITY = 15;
export const ROUTE_QUOTA_MIN_SMALL = 8;
export const ROUTE_QUOTA_MIN_REGIONAL_COUNCIL = 10;
export const LARGE_CITY_MIN_POPULATION = 200_000;
export const MEDIUM_CITY_MIN_POPULATION = 70_000;

/** Score weights — sum to 100. */
export const READINESS_WEIGHTS = {
  boundary: 15,
  snapshot: 10,
  minRoutes: 10,
  osmLayersMeasured: 15,
  routeQuota: 15,
  shade: 15,
  bigParks: 5,
  pointDensity: 10,
  sourcesClean: 5,
} as const;

export function routeQuotaMin(authorityType: AuthorityType, population: number | null): number {
  if (authorityType === 'regional_council') return ROUTE_QUOTA_MIN_REGIONAL_COUNCIL;
  const pop = typeof population === 'number' && Number.isFinite(population) ? population : 0;
  if (pop >= LARGE_CITY_MIN_POPULATION) return ROUTE_QUOTA_MIN_LARGE_CITY;
  if (pop >= MEDIUM_CITY_MIN_POPULATION) return ROUTE_QUOTA_MIN_MEDIUM_CITY;
  return ROUTE_QUOTA_MIN_SMALL;
}

export function isLayerMeasured(layer: InventoryLayer | null | undefined): boolean {
  if (!layer) return false;
  return layer.count !== null || layer.coveragePct !== null || layer.lengthKm !== null || layer.areaKm2 !== null;
}

export interface ReadinessInput {
  hasBoundary: boolean;
  /** ISO date of the OSM snapshot, or null. */
  osmSnapshotDate: string | null;
  approvedRoutes: number;
  authorityType: AuthorityType;
  population: number | null;
  layers: Partial<Record<InventoryLayerKey, InventoryLayer>>;
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const W = READINESS_WEIGHTS;
  const layers = input.layers ?? {};
  const blockers: string[] = [];
  const missing = new Set<InventoryLayerKey>();
  const routes = Number.isFinite(input.approvedRoutes) ? Math.max(0, input.approvedRoutes) : 0;
  const quota = routeQuotaMin(input.authorityType, input.population);
  let score = 0;

  const boundary = input.hasBoundary === true;
  const snapshot = typeof input.osmSnapshotDate === 'string' && Number.isFinite(Date.parse(input.osmSnapshotDate));
  const minRoutes = routes >= RED_MIN_APPROVED_ROUTES;
  if (boundary) score += W.boundary; else blockers.push('no authority boundary');
  if (snapshot) score += W.snapshot; else blockers.push('no OSM snapshot');
  if (minRoutes) score += W.minRoutes; else blockers.push(`fewer than ${RED_MIN_APPROVED_ROUTES} approved routes`);

  const unmeasuredOsm = OSM_LAYER_KEYS.filter((k) => !isLayerMeasured(layers[k]));
  unmeasuredOsm.forEach((k) => missing.add(k));
  score += W.osmLayersMeasured * ((OSM_LAYER_KEYS.length - unmeasuredOsm.length) / OSM_LAYER_KEYS.length);
  if (unmeasuredOsm.length) blockers.push(`OSM layers not measured: ${unmeasuredOsm.join(', ')}`);

  const quotaMet = routes >= quota;
  score += W.routeQuota * Math.min(1, routes / quota);
  if (!quotaMet) blockers.push(`approved routes ${routes} < quota minimum ${quota}`);

  const shadePct = layers.shade?.coveragePct ?? null;
  const shadeOk = shadePct !== null && shadePct >= GREEN_MIN_SHADE_COVERAGE_PCT;
  if (shadeOk) score += W.shade;
  else {
    missing.add('shade');
    blockers.push(shadePct === null ? 'shade not measured' : `shade coverage ${shadePct}% < ${GREEN_MIN_SHADE_COVERAGE_PCT}%`);
  }

  const bigParksOk = isLayerMeasured(layers.big_parks);
  if (bigParksOk) score += W.bigParks; else blockers.push('big-park polygons not measured');

  const lowDensity = POINT_LAYER_KEYS.filter((k) => layers[k]?.quality?.includes('below_expected_density'));
  lowDensity.forEach((k) => missing.add(k));
  const densityOk = lowDensity.length === 0;
  if (densityOk) score += W.pointDensity; else blockers.push(`below expected density: ${lowDensity.join(', ')}`);

  const measured = INVENTORY_LAYER_KEYS.map((k) => layers[k]).filter((l): l is InventoryLayer => isLayerMeasured(l));
  const licensePending = measured.some((l) => l.quality?.includes('license_pending'));
  const undated = measured.some((l) => (l.sources ?? []).some((s) => !s?.snapshotDate));
  const sourcesClean = !licensePending && !undated;
  if (sourcesClean) score += W.sourcesClean;
  else blockers.push(licensePending ? 'a source licence is pending' : 'a source has no snapshot date');

  const yellow = boundary && snapshot && minRoutes && unmeasuredOsm.length === 0 && quotaMet;
  const green = yellow && shadeOk && bigParksOk && densityOk && sourcesClean;
  const level: ReadinessLevel = green ? 'green' : yellow ? 'yellow' : 'red';

  return {
    score: Math.round(score),
    level,
    missing: INVENTORY_LAYER_KEYS.filter((k) => missing.has(k)),
    blockers,
  };
}
