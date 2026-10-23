/**
 * Destination planner — route generation (the only I/O in the planner).
 *
 *   • A→B variants: the existing commute generator (generateDynamicRoutes
 *     with a destination — Mapbox alternatives: fastest / alternative / quiet),
 *     exactly what RouteCarousel's commute mode calls.
 *   • Via a fitness park: one Mapbox Directions request per picked park with
 *     the park as a waypoint (walking / running only — no cycling stop).
 *
 * Never throws: a failed via-park request just drops that option.
 */
import type { Park } from '../types/park.types';
import type { Route } from '../types/route.types';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { MapboxService, type MapboxDirectionsExtraParams, type MapboxPathResult } from '../services/mapbox.service';
import { computeGeneratorDifficulty } from '../services/generator-elevation.service';
import { KCAL_PER_KM, SPEED_KMH } from '../services/route-request.utils';
import { distanceAlongToNearest, pickViaParks, type ViaParkPick } from './via-park';
import type { LatLng, PlannerCandidates, PlannerMode, ViaParkCandidate } from './types';

export async function buildViaParkRoute(result: MapboxPathResult, pick: ViaParkPick, mode: PlannerMode): Promise<ViaParkCandidate> {
  const km = parseFloat((result.distance / 1000).toFixed(2));
  const dem = await computeGeneratorDifficulty(result.path);
  const duration = mode === 'running'
    ? Math.max(1, Math.round((km / SPEED_KMH.running) * 60))
    : Math.max(1, Math.round(result.duration / 60));
  const route: Route = {
    id: `dest-via-${pick.park.id}-${Date.now()}`,
    name: pick.park.name,
    distance: km,
    duration,
    score: Math.round(km * 60),
    rating: 5,
    calories: Math.round(km * KCAL_PER_KM[mode]),
    type: mode,
    activityType: mode,
    difficulty: dem.difficulty,
    elevationGain: dem.elevationGain,
    maxGrade: dem.maxGrade,
    path: result.path,
    segments: [],
    features: {
      hasGym: true,
      hasBenches: false,
      lit: false,
      scenic: false,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: 'medium',
      surface: 'asphalt',
    },
    source: { type: 'system', name: 'OutRun Commute' },
    visitingParkId: pick.park.id,
    includesFitnessStop: true,
    etaSeconds: result.duration,
  };
  return {
    route,
    stop: { parkId: pick.park.id, name: pick.park.name, location: pick.location, afterKm: distanceAlongToNearest(result.path, pick.location) },
  };
}

/**
 * Per-mode routing (Google-Maps-style tabs: each mode gets ITS own route).
 * Mapbox has no running profile, so running used to be the exact walking
 * request (same route, the tab "did nothing"). Running now asks the walking
 * profile to prefer footpaths / sidewalks (`walkway_bias`, -1…1); cycling
 * uses the cycling profile (generator); walking stays the plain request.
 */
export function directionsParamsFor(mode: PlannerMode): MapboxDirectionsExtraParams | undefined {
  return mode === 'running' ? { walkway_bias: '1' } : undefined;
}

async function viaParkRoutes(from: LatLng, to: LatLng, mode: PlannerMode, parks: Park[]): Promise<ViaParkCandidate[]> {
  if (mode === 'cycling') return [];
  const picks = pickViaParks(from, to, parks);
  const built = await Promise.all(picks.map(async (pick) => {
    try {
      const res = await MapboxService.getSmartPathAlternatives(from, to, 'walking', [pick.location], directionsParamsFor(mode) ?? {});
      const best = [...res].sort((a, b) => a.distance - b.distance)[0];
      return best ? await buildViaParkRoute(best, pick, mode) : null;
    } catch {
      return null;
    }
  }));
  return built.filter((b): b is ViaParkCandidate => b !== null);
}

export async function fetchPlannerCandidates(args: { from: LatLng; to: LatLng; mode: PlannerMode; parks: Park[] }): Promise<PlannerCandidates> {
  const { from, to, mode, parks } = args;
  const [commute, viaParks] = await Promise.all([
    generateDynamicRoutes({
      userLocation: from,
      destination: to,
      activity: mode,
      routeGenerationIndex: Date.now(),
      preferences: { includeStrength: false },
      parks,
      commuteDirectionsParams: directionsParamsFor(mode),
      // Unused on the commute branch, but the option shape requires it.
      targetDistance: 0,
    }).catch(() => [] as Route[]),
    viaParkRoutes(from, to, mode, parks),
  ]);
  return { commute: commute.slice(0, 3), viaParks };
}
