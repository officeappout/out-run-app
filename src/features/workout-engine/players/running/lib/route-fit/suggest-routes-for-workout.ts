/**
 * suggestRoutesForWorkout — "הצע לי מסלול" in the run overview: up to 3
 * routes from the user's current location for TODAY's planned run, best
 * first (the carousel preselects [0]).
 *
 * Candidates, cheapest first (no new reads, no unbounded scans):
 *   1. Stored official routes from the EXISTING in-memory cache
 *      (getCachedOfficialRoutes — the same one the map's route builder
 *      uses; one fetch per app session). Filtered to on-foot routes whose
 *      path passes within `radiusKm` of the origin, nearest
 *      `candidateLimit` kept, then scored.
 *   2. Only when fewer than `limit` of those are good: the existing loop
 *      generator (generateDynamicRoutes, same call the map makes) for the
 *      workout's distance from the origin. Failures are swallowed — the
 *      official results still come back.
 *
 * I/O is injected (deps) so the ranking is unit-tested without Firebase.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import { routeHasActivity, routeMatchesActivity } from '@/features/parks/core/utils/route-activity-match';
import { accessKm } from './route-traits';
import { routeKm } from './distance-fit';
import { DEFAULT_RADIUS_KM, scoreRouteForWorkout, type ScorableRoute } from './score-route-for-workout';
import type { RouteWorkoutScore, WorkoutRouteNeeds } from './types';

export interface LatLng { lat: number; lng: number }

export interface RouteSuggestion {
  route: Route;
  score: RouteWorkoutScore;
  isGenerated: boolean;
}

export interface SuggestRoutesDeps {
  getOfficialRoutes: () => Promise<Route[]>;
  generateRoutes: (args: { origin: LatLng; targetKm: number; attempt: number; cityName?: string }) => Promise<Route[]>;
}

export interface SuggestRoutesOptions {
  /** How many to return (default 3, the carousel). */
  limit?: number;
  /** Search radius around the origin, km (default 2.5). */
  radiusKm?: number;
  /** Max official routes scored per call (default 30). */
  candidateLimit?: number;
  /** Fall back to the loop generator (default true). */
  allowGenerated?: boolean;
  /** Bumps the generator's variety index on "another suggestion" (default 0). */
  attempt?: number;
  /** Score at/above which an official route counts as "good" (default 55). */
  goodScore?: number;
  /** The user's city (useUserCityName) — the generator queries street_segments by it; absent → random waypoints. */
  cityName?: string;
  deps?: Partial<SuggestRoutesDeps>;
}

export const SUGGEST_LIMIT = 3;
export const CANDIDATE_LIMIT = 30;
/** Generator floor — same as the generator's own MIN_GENERATION_KM (kept local to avoid loading it). */
const GENERATE_MIN_KM = 1.5;

/** On-foot official routes within reach of the origin, nearest first, capped. Pure. */
export function nearbyRunRoutes(
  routes: readonly Route[],
  origin: LatLng,
  radiusKm = DEFAULT_RADIUS_KM,
  cap = CANDIDATE_LIMIT,
): Route[] {
  const out: { r: Route; d: number }[] = [];
  for (const r of routes) {
    if (!Array.isArray(r.path) || r.path.length < 2) continue;
    if (routeHasActivity(r) && !routeMatchesActivity(r, 'running')) continue;
    // Cheap prefilter on the start point: nothing of a route lies further than its own length from its start.
    const s = r.path[0];
    if (!s || typeof s[0] !== 'number' || typeof s[1] !== 'number') continue;
    if (haversineKm(origin.lat, origin.lng, s[1], s[0]) > radiusKm + routeKm(r)) continue;
    const d = accessKm(r, origin);
    if (d <= radiusKm) out.push({ r, d });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, cap).map((x) => x.r);
}

/** Score + rank already-fetched candidates. Pure. */
export function rankRouteSuggestions(
  origin: LatLng,
  workout: WorkoutRouteNeeds,
  official: readonly Route[],
  generated: readonly Route[],
  opts: { limit?: number; radiusKm?: number } = {},
): RouteSuggestion[] {
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;
  const seen = new Set<string>();
  const all: RouteSuggestion[] = [];
  const add = (route: Route, isGenerated: boolean) => {
    if (seen.has(route.id)) return;
    seen.add(route.id);
    all.push({ route, isGenerated, score: scoreRouteForWorkout(route as ScorableRoute, workout, { origin, isGenerated, radiusKm }) });
  };
  official.forEach((r) => add(r, false));
  generated.forEach((r) => add(r, true));
  return all
    .filter((s) => s.score.fit.verdict !== 'no')
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, opts.limit ?? SUGGEST_LIMIT);
}

// ── Default I/O (lazy so tests never load Firebase) ───────────────────────

let parksCache: Promise<unknown[]> | null = null;

const defaultDeps: SuggestRoutesDeps = {
  async getOfficialRoutes() {
    const { getCachedOfficialRoutes } = await import('@/features/parks/core/services/inventory.service');
    return getCachedOfficialRoutes();
  },
  async generateRoutes({ origin, targetKm, attempt, cityName }) {
    const [{ generateDynamicRoutes }, { fetchRealParks }] = await Promise.all([
      import('@/features/parks/core/services/route-generator.service'),
      import('@/features/parks/core/services/parks.service'),
    ]);
    if (!parksCache) parksCache = fetchRealParks().catch((e) => { parksCache = null; throw e; });
    const parks = (await parksCache) as Parameters<typeof generateDynamicRoutes>[0]['parks'];
    return generateDynamicRoutes({
      userLocation: origin,
      targetDistance: targetKm,
      activity: 'running',
      routeGenerationIndex: attempt,
      preferences: { includeStrength: false },
      parks,
      cityName,
      userAnchoredCorridorFlow: true,
    });
  },
};

export async function suggestRoutesForWorkout(
  origin: LatLng,
  workout: WorkoutRouteNeeds,
  opts: SuggestRoutesOptions = {},
): Promise<RouteSuggestion[]> {
  const deps = { ...defaultDeps, ...opts.deps };
  const limit = opts.limit ?? SUGGEST_LIMIT;
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;

  let official: Route[] = [];
  try {
    official = nearbyRunRoutes(await deps.getOfficialRoutes(), origin, radiusKm, opts.candidateLimit ?? CANDIDATE_LIMIT);
  } catch (err) {
    console.warn('[route-fit] official routes unavailable', err);
  }
  let ranked = rankRouteSuggestions(origin, workout, official, [], { limit, radiusKm });

  const good = ranked.filter((s) => s.score.score >= (opts.goodScore ?? 55)).length;
  const targetKm = workout.targetKm;
  if ((opts.allowGenerated ?? true) && good < limit && targetKm != null && targetKm >= GENERATE_MIN_KM) {
    try {
      const generated = await deps.generateRoutes({ origin, targetKm, attempt: opts.attempt ?? 0, cityName: opts.cityName });
      ranked = rankRouteSuggestions(origin, workout, official, generated, { limit, radiusKm });
    } catch (err) {
      console.warn('[route-fit] generator failed — official results only', err);
    }
  }
  return ranked;
}
