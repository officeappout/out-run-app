import type { Route } from '@/features/parks/core/types/route.types';

export const ORIGIN = { lat: 32.08, lng: 34.78 };
const M_LAT = 1 / 111_320;
const M_LNG = 1 / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180));

/** [lng, lat] at (east, north) metres from `from`. */
export function at(eastM: number, northM: number, from = ORIGIN): [number, number] {
  return [from.lng + eastM * M_LNG, from.lat + northM * M_LAT];
}

/** Closed square loop of `perimeterM`, starting `offsetM` east of the origin. */
export function squareLoop(perimeterM: number, offsetM = 0): [number, number][] {
  const s = perimeterM / 4;
  return [at(offsetM, 0), at(offsetM + s, 0), at(offsetM + s, s), at(offsetM, s), at(offsetM, 0)];
}

/** Straight line north of `lengthM` (with a vertex every 100 m). */
export function lineNorth(lengthM: number, offsetM = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let m = 0; m <= lengthM; m += 100) pts.push(at(offsetM, m));
  return pts;
}

export function makeRoute(over: Partial<Route> & { id: string; elevationProfile?: unknown }): Route & { elevationProfile?: unknown } {
  return {
    name: over.id,
    distance: 5,
    duration: 30,
    score: 0,
    type: 'running',
    activityType: 'running',
    difficulty: 'easy',
    rating: 0,
    calories: 0,
    features: { hasGym: false, hasBenches: false, scenic: false, terrain: '', environment: '', trafficLoad: '', surface: '' },
    segments: [],
    path: squareLoop(5000),
    ...over,
  } as Route & { elevationProfile?: unknown };
}

/** A flat profile with one climb of `gradePct` over `lengthM` starting at `startM`. */
export function profileWithClimb(totalM: number, stepM: number, startM: number, lengthM: number, gradePct: number) {
  const n = Math.round(totalM / stepM) + 1;
  const elevationsM: number[] = [];
  let e = 20;
  for (let i = 0; i < n; i++) {
    elevationsM.push(e);
    const x = i * stepM;
    if (x >= startM && x < startM + lengthM) e += (gradePct / 100) * stepM;
  }
  return { stepM, elevationsM };
}

export const qs = (over: Record<string, unknown>) => ({
  composition: { sidewalkPct: 0, genuinePct: 0, ordinaryPct: 0, otherPct: 0 },
  computedAt: null,
  source: 'osm_overpass_v1' as const,
  ...over,
});
