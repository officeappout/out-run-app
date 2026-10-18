/**
 * route-shape.ts — PURE helpers for the persisted `Route.routeShape`.
 *
 * 'point_to_point' (trails pipeline, 18.10.2026, owner-approved) is an
 * explicitly ONE-WAY A→B route. It must never be treated as a loop: a stored
 * shape wins over geometry, and only routes WITHOUT a stored non-loop shape
 * fall back to the geometric `classifyRouteShape` test.
 */
import type { Route } from '../types/route.types';
import { classifyRouteShape } from './geoUtils';

type ShapeInput = Pick<Route, 'routeShape' | 'path'> & { trail?: Route['trail'] };

export function isPointToPointRoute(route: Pick<Route, 'routeShape'> | null | undefined): boolean {
  return route?.routeShape === 'point_to_point';
}

/** Loop for rotation / "returns to you" purposes. Stored one-way or out-and-back → never a loop. */
export function isLoopRoute(route: ShapeInput | null | undefined): boolean {
  if (!route) return false;
  if (route.routeShape === 'point_to_point' || route.routeShape === 'out_and_back') return false;
  const path = route.path;
  return Array.isArray(path) && path.length >= 3 && classifyRouteShape(path) === 'loop';
}

/**
 * "מסלול חד-כיווני · A → B" for a point-to-point route (endpoint names from
 * `trail.endpoints`; just "מסלול חד-כיווני" when either end is unnamed).
 * null for every other shape — callers keep their existing text.
 */
export function pointToPointLabel(route: ShapeInput | null | undefined): string | null {
  if (!isPointToPointRoute(route)) return null;
  const from = route?.trail?.endpoints?.from?.trim();
  const to = route?.trail?.endpoints?.to?.trim();
  return from && to && from !== to ? `מסלול חד-כיווני · ${from} → ${to}` : 'מסלול חד-כיווני';
}
