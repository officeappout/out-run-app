/**
 * GraphHopper routes (panel flag enable_graphhopper_routes, default OFF).
 * An explicit boolean (admin A/B page, tests) wins; otherwise the device's
 * last-known live flag.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export function resolveGraphhopperRoutes(override: boolean | undefined): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableGraphhopperRoutes');
}

/** Loops prefer marked trails (panel flag enable_loops_prefer_marked_trails, default OFF) — the device's last-known live flag. */
export function resolveLoopsPreferMarkedTrails(override?: boolean): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableLoopsPreferMarkedTrails');
}

/** Time-aware preference (panel flag enable_route_time_aware, default OFF) — the device's last-known live flag. */
export function resolveRouteTimeAware(override?: boolean): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableRouteTimeAware');
}

/** "🌳 מוצל X%" on route cards (panel flag enable_route_shade_tag, default OFF) — the device's last-known live flag. */
export function resolveRouteShadeTag(override?: boolean): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableRouteShadeTag');
}
