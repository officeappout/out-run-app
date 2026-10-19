/**
 * Which generateDynamicRoutes calls GraphHopper serves: plain loops only.
 * Commute, corridor-following/chain/flow, short-route mode, deviation
 * recovery (activeOfficialRouteId) and loops through a fitness stop keep
 * their existing Mapbox paths.
 */
import type { ActivityType } from '../../types/route.types';

/** The subset of RouteGenerationOptions this adapter reads. */
export interface GhLoopOptions {
  userLocation: { lat: number; lng: number };
  targetDistance: number;
  activity: ActivityType;
  routeGenerationIndex: number;
  preferences: { includeStrength: boolean; maxRoutes?: number };
  destination?: unknown;
  followOfficialRouteId?: string;
  discoverCorridorChain?: boolean;
  userAnchoredCorridorFlow?: boolean;
  shortRouteMode?: boolean;
  activeOfficialRouteId?: string;
}

/** Same floor as route-generator.service.ts MIN_GENERATION_KM. */
export const GH_MIN_TARGET_KM = 1.5;

export type GhActivity = 'running' | 'walking' | 'cycling';

export function isGraphhopperLoopRequest(o: GhLoopOptions): o is GhLoopOptions & { activity: GhActivity } {
  if (o.destination || o.followOfficialRouteId || o.discoverCorridorChain || o.userAnchoredCorridorFlow) return false;
  if (o.activeOfficialRouteId) return false;
  if (o.preferences?.includeStrength) return false;
  if (o.activity !== 'running' && o.activity !== 'walking' && o.activity !== 'cycling') return false;
  const km = typeof o.targetDistance === 'number' && !isNaN(o.targetDistance) ? o.targetDistance : 3;
  if (o.shortRouteMode && km < GH_MIN_TARGET_KM) return false;
  return true;
}
