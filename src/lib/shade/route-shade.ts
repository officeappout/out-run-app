/**
 * Shade of one route, ready for routeScore (owner decisions 21.10.2026):
 *   - measured only when the shade layer covers ≥ 50% of the route length
 *     (SHADE_MIN_COVERAGE); otherwise "not measured" — no penalty;
 *   - shadeShare = length-weighted mean SI over the measured length;
 *   - shadedPct  = % of the measured length on segments with SI ≥ SHADED_MIN_SI.
 * Pure, no I/O. The index comes from buildShadeIndex (one per city).
 */
import { shadeShareForLine, type ShadeSpatialIndex } from './match';
import type { LonLat } from './types';

/** Below this share of the route inside the shade layer, shade is "not measured". */
export const SHADE_MIN_COVERAGE = 0.5;

/**
 * A street segment counts as "shaded" at SI ≥ 0.25. Why 0.25: the public
 * layers carry the lab's daily summer SI (share of radiation blocked), whose
 * city means run 0.08–0.28. 0.25 sits just under the best-shaded city's mean
 * (Tel Aviv 0.28) and well above the desert-city means (Be'er Sheva 0.08,
 * Netivot 0.08), so "shaded" means "as shaded as a good Tel Aviv street", not
 * "above the local average". It is also 60% of the way up the comfort scale
 * (0.10 → 0.35), i.e. a segment that earns most of the shade points.
 */
export const SHADED_MIN_SI = 0.25;

/** Source tag stored with every measurement — lets a future layer version coexist. */
export const ROUTE_SHADE_SOURCE = 'technion_v1';

export type RouteShadeStatus = 'measured' | 'low_coverage' | 'no_data';

export interface RouteShade {
  status: RouteShadeStatus;
  /** 0..1 mean SI over the measured length; null unless status is 'measured'. */
  shadeShare: number | null;
  /** 0..100; null unless status is 'measured'. */
  shadedPct: number | null;
  /** 0..1 share of the route length inside the shade layer. */
  coverage: number;
  source: string;
  indexType: 'SI_daily';
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function measureRouteShade(line: LonLat[], idx: ShadeSpatialIndex | null): RouteShade {
  const base = { source: ROUTE_SHADE_SOURCE, indexType: 'SI_daily' as const };
  if (!idx || !idx.size || line.length < 2) return { status: 'no_data', shadeShare: null, shadedPct: null, coverage: 0, ...base };
  const res = shadeShareForLine(line, idx, { shadedMinIndex: SHADED_MIN_SI });
  const coverage = r3(res.coverage);
  if (res.shadeShare == null || res.coverage < SHADE_MIN_COVERAGE) {
    return { status: res.matchedLengthM > 0 ? 'low_coverage' : 'no_data', shadeShare: null, shadedPct: null, coverage, ...base };
  }
  return {
    status: 'measured',
    shadeShare: r3(res.shadeShare),
    shadedPct: Math.round((res.shadedLengthM / res.matchedLengthM) * 1000) / 10,
    coverage,
    ...base,
  };
}
