/**
 * GraphHopper loop (API DTO) → the app's Route, mirroring the Mapbox loop
 * builder's shape (route-generator.service.ts attemptOneCombination) but with
 * honest attributes only: no invented rating / benches / lighting; traffic
 * load from the measured major-road share; difficulty from GraphHopper's
 * SRTM elevation.
 */
import type { GeneratedLoopDto } from '@/lib/routing/api-contract';
import type { Route } from '../../types/route.types';
import { classifyRouteShape } from '../geoUtils';
import { KCAL_PER_KM, SPEED_KMH } from '../route-request.utils';
import { computeDifficulty, difficultyLevelToRouteDifficulty } from '../route-difficulty.service';
import type { GhActivity } from './eligible';

export function trafficLoadFromShare(share: number | null): string {
  if (share == null) return 'unknown';
  if (share < 0.1) return 'low';
  if (share < 0.35) return 'medium';
  return 'high';
}

export function loopDtoToRoute(l: GeneratedLoopDto, index: number, activity: GhActivity, generationIndex: number): Route {
  const km = l.distanceKm;
  const duration = activity === 'running' ? Math.round((km / SPEED_KMH.running) * 60) : Math.max(1, Math.round(l.timeMin));
  const difficulty = difficultyLevelToRouteDifficulty(computeDifficulty(l.ascendM, l.maxGradePct, km).level);
  const quality = Math.max(0, Math.round(100 - l.score * 10));
  return {
    id: `gh-${Date.now()}-${index}-${generationIndex}`,
    name: 'סיבוב אורבני',
    description: `מסלול מעגלי של ${km.toFixed(1)} ק"מ`,
    distance: parseFloat(km.toFixed(1)),
    duration,
    score: Math.round(quality + km * 10),
    type: activity,
    activityType: activity,
    difficulty,
    elevationGain: l.ascendM,
    maxGrade: l.maxGradePct,
    routeShape: classifyRouteShape(l.path),
    path: l.path,
    segments: [],
    rating: 0,
    calories: Math.round(km * KCAL_PER_KM[activity]),
    analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
    source: { type: 'system', name: 'OutRun AI' },
    features: {
      hasGym: false,
      hasBenches: false,
      scenic: false,
      lit: undefined,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: trafficLoadFromShare(l.majorRoadPct),
      surface: 'asphalt',
    },
    calculatedScore: quality,
    distanceFromUser: 0,
    isReachableWithoutCar: true,
    includesOfficialSegments: false,
    visitingParkId: null,
    includesFitnessStop: false,
  };
}
