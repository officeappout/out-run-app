/**
 * GraphHopper routes (enable_graphhopper_routes) — the small adapter hook
 * generateDynamicRoutes calls before its own loop pipeline. Returns null for
 * "not handled here" (flag off, not a plain loop, any error / timeout / empty
 * answer); the generator then runs exactly as without this module.
 */
import { fetchGraphhopperLoops, type ApiClientDeps } from './api-client';
import { GH_MIN_TARGET_KM, isGraphhopperLoopRequest, type GhLoopOptions } from './eligible';
import { loopDtoToRoute } from './to-route';
import { resolveRouteTimeAware } from './flag';
import type { Route } from '../../types/route.types';
import type { WireOurRoute } from '@/lib/routing/our-routes/wire';

export { resolveGraphhopperRoutes, resolveRouteTimeAware } from './flag';
export { isGraphhopperLoopRequest, type GhLoopOptions } from './eligible';
export { fetchGraphhopperLoops, GH_CLIENT_TIMEOUT_MS } from './api-client';
export { loopDtoToRoute } from './to-route';

/** `ourRoutes` (enable_loops_prefer_official): our mapped routes near the start, already in wire form. */
export async function tryGraphhopperLoops(o: GhLoopOptions, deps?: ApiClientDeps, ourRoutes?: WireOurRoute[]): Promise<Route[] | null> {
  if (!isGraphhopperLoopRequest(o)) return null;
  const raw = typeof o.targetDistance === 'number' && !isNaN(o.targetDistance) ? o.targetDistance : 3;
  try {
    const res = await fetchGraphhopperLoops({
      mode: 'loop',
      start: o.userLocation,
      targetKm: Math.max(raw, GH_MIN_TARGET_KM),
      activity: o.activity,
      seed: o.routeGenerationIndex,
      maxResults: Math.max(1, Math.min(3, o.preferences.maxRoutes ?? 3)),
      ...(ourRoutes && ourRoutes.length > 0 ? { ourRoutes } : {}),
      // "Shadiest route" (enable_route_pref_shade): the server ranks by shade where it has data.
      ...(o.preferences.preferShade ? { preferShade: true, ...(o.cityName ? { city: o.cityName } : {}) } : {}),
      // Time-aware (enable_route_time_aware): shade at this hour by day, lit streets after dark. Off = absent.
      ...(!o.preferences.preferShade && resolveRouteTimeAware(o.timeAware) ? { timeAware: true, ...(o.cityName ? { city: o.cityName } : {}) } : {}),
    }, deps);
    if (res.loops.length === 0) return null;
    return res.loops.map((l, i) => loopDtoToRoute(l, i, o.activity, o.routeGenerationIndex));
  } catch (e) {
    console.warn('[RouteGenerator] GraphHopper unavailable — falling back to Mapbox:', (e as Error)?.message);
    return null;
  }
}
