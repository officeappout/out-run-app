/**
 * city-inventory/lighting-coverage.ts — how much of a city's walkable
 * network the lighting/v1 file answers (lit yes/no ÷ walkable), and how much
 * is lit. Same matcher as routes and shade coverage. Pure.
 */
import { measureRouteLighting, type LitIndex } from '@/lib/lighting/route-lighting';
import type { LngLat } from '@/lib/park-loops/types';

export const CITY_LIGHTING_STEP_M = 10;

export interface LightingCoverage {
  walkableM: number;
  knownM: number;
  litM: number;
}

export function measureLightingCoverage(lines: readonly LngLat[][], idx: LitIndex | null): LightingCoverage | null {
  if (!idx || !idx.size) return null;
  let walkableM = 0, knownM = 0, litM = 0;
  for (const line of lines) {
    if (line.length < 2) continue;
    const r = measureRouteLighting(line, idx, CITY_LIGHTING_STEP_M);
    walkableM += r.totalLengthM;
    knownM += r.coverage * r.totalLengthM;
    litM += r.litLengthShare * r.totalLengthM;
  }
  return { walkableM, knownM, litM };
}
