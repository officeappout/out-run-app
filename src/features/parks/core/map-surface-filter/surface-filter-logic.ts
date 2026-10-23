/**
 * Map surface filter (enable_map_surface_filter_v1) — pure logic, no React, no I/O.
 *
 * The filter narrows the routes the map draws and the carousel offers by their
 * surface class (stored `surfaceClass`, see ../utils/route-surface.ts). Unknown
 * surface is HIDDEN while a filter is active (owner decision 23.10.2026).
 * With the flag off, or the filter on 'any', the input list is returned untouched.
 */
import type { ActivityType, Route } from '../types/route.types';
import { routeHasActivity, routeMatchesActivity } from '../utils/route-activity-match';
import { routeMatchesSurfaceFilter, type SurfaceFilter } from '../utils/route-surface';

export const DEFAULT_SURFACE_FILTER: SurfaceFilter = 'any';

export interface SurfaceFilterResult<R> {
  /** The routes that pass (the input array itself when nothing is filtered). */
  routes: R[];
  /** Routes passing the surface filter (before any display cap). */
  shown: number;
  /** Routes matching the activity (the denominator of "X of Y"). */
  total: number;
}

type ActivityFields = Pick<Route, 'activityTypes' | 'activityType' | 'type'>;

export function parseSurfaceFilter(value: unknown): SurfaceFilter {
  return value === 'paved' || value === 'offroad' ? value : DEFAULT_SURFACE_FILTER;
}

/** Number of active filters (the layers-button badge). Flag off → 0. */
export function activeSurfaceFilterCount(filter: SurfaceFilter, enabled: boolean): number {
  return enabled && filter !== 'any' ? 1 : 0;
}

/** Which segmented-control family the activity uses. */
export function surfaceFamilyFor(activity: ActivityType | null | undefined): 'bike' | 'foot' {
  return activity === 'cycling' ? 'bike' : 'foot';
}

export function applySurfaceFilter<R extends ActivityFields>(
  routes: readonly R[],
  filter: SurfaceFilter,
  activity: ActivityType | null | undefined,
  enabled: boolean,
): SurfaceFilterResult<R> {
  if (!enabled) return { routes: routes as R[], shown: routes.length, total: routes.length };
  // Y: routes of this activity (untyped routes count — callers offered them before).
  const forActivity = activity
    ? routes.filter((r) => !routeHasActivity(r) || routeMatchesActivity(r, activity))
    : routes.slice();
  const total = forActivity.length;
  if (filter === 'any') return { routes: routes as R[], shown: total, total };
  const passing = forActivity.filter((r) => routeMatchesSurfaceFilter(r, filter, { activity }));
  return { routes: passing, shown: passing.length, total };
}
