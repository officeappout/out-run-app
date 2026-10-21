/**
 * city-inventory/shade-coverage.ts — how much of a city's walkable network
 * the Technion street shade layer covers (plan §3.4: "ways with a computed
 * shade value ÷ all walkable ways"). Pure.
 *
 * Reuses the route matcher (`shadeShareForLine`) way by way, so a city's
 * coverage is measured exactly the way a route's is. A coarser walking step
 * than the route default keeps a whole city in seconds; at 10 m the share
 * moves by well under a percentage point.
 */
import { shadeShareForLine, type ShadeSpatialIndex } from '@/lib/shade/match';
import { SHADED_MIN_SI } from '@/lib/shade/route-shade';
import type { LngLat } from '@/lib/park-loops/types';

export const CITY_SHADE_STEP_M = 10;

export interface ShadeCoverage {
  walkableM: number;
  matchedM: number;
  /** Matched length on segments with SI ≥ SHADED_MIN_SI. */
  shadedM: number;
  /** Length-weighted mean SI over the matched length, 0..1; null when nothing matched. */
  meanSI: number | null;
}

export function measureShadeCoverage(lines: readonly LngLat[][], idx: ShadeSpatialIndex | null): ShadeCoverage | null {
  if (!idx || !idx.size) return null;
  let walkableM = 0, matchedM = 0, shadedM = 0, weighted = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    const r = shadeShareForLine(line, idx, { stepM: CITY_SHADE_STEP_M, shadedMinIndex: SHADED_MIN_SI });
    walkableM += r.totalLengthM;
    matchedM += r.matchedLengthM;
    shadedM += r.shadedLengthM;
    if (r.shadeShare !== null) weighted += r.shadeShare * r.matchedLengthM;
  }
  return { walkableM, matchedM, shadedM, meanSI: matchedM > 0 ? Math.round((weighted / matchedM) * 1000) / 1000 : null };
}
