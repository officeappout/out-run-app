/**
 * route-activity-match.ts — pure route-level activity matching (routes
 * phase 1.3).
 *
 * Walking and running are one "on foot" family at the ROUTE level: a route
 * suitable for walking is suitable for running and vice versa, so picking
 * either must surface every on-foot route. The match reads the route's
 * `activityTypes` array, falling back to `activityType`, then `type`.
 *
 * Sessions are NOT affected — a walk is still recorded as a walk and a run
 * as a run; this only decides which routes are offered.
 *
 * Cycling (and 'workout') deliberately keep the previous strict rule:
 * the route's primary activity (activityType ?? type) must equal the
 * requested one. Cycling is out of scope for this change.
 */
import type { ActivityType, Route } from '../types/route.types';

export const ON_FOOT_ACTIVITIES: readonly ActivityType[] = ['walking', 'running'];

export function isOnFootActivity(act: ActivityType | null | undefined): boolean {
  return act === 'walking' || act === 'running';
}

type RouteActivityFields = Pick<Route, 'activityTypes' | 'activityType' | 'type'>;

/** The route's primary activity — activityType, falling back to type. */
export function primaryRouteActivity(route: RouteActivityFields): ActivityType | undefined {
  return route.activityType || route.type || undefined;
}

/**
 * Every activity the route declares: `activityTypes` when it's a non-empty
 * array, otherwise the primary activity alone (or [] when untyped).
 */
export function routeActivities(route: RouteActivityFields): ActivityType[] {
  if (Array.isArray(route.activityTypes) && route.activityTypes.length > 0) {
    return route.activityTypes;
  }
  const primary = primaryRouteActivity(route);
  return primary ? [primary] : [];
}

/** Whether the route declares any activity at all. */
export function routeHasActivity(route: RouteActivityFields): boolean {
  return routeActivities(route).length > 0;
}

/**
 * True when the route should be offered for `requested`.
 * - walking / running → any on-foot activity in the route's activities.
 * - anything else (cycling, workout) → strict primary-activity equality,
 *   exactly as before.
 * Untyped routes return false here; callers that used to accept untyped
 * routes check `routeHasActivity` themselves (behaviour preserved per caller).
 */
export function routeMatchesActivity(route: RouteActivityFields, requested: ActivityType): boolean {
  if (isOnFootActivity(requested)) {
    return routeActivities(route).some(isOnFootActivity);
  }
  return primaryRouteActivity(route) === requested;
}
