/**
 * v1: stop presenting invented route attributes. Generated routes used to
 * claim lit:true, trafficLoad:'low', hasBenches:true and a random 4.5–5★
 * rating with no data behind any of it. With the flag on: rating 0 (unrated),
 * no benches claim, lit unknown (undefined — RouteFeatures.lit's contract),
 * and trafficLoad derived from the measured share of the route on tertiary+
 * roads when the OSM layer was available, else 'unknown'.
 */
import type { Route } from '../../types/route.types';
import type { RouteQualityMetrics } from '@/lib/route-quality';

export function trafficLoadFromMetrics(m: RouteQualityMetrics | null | undefined): string {
  if (!m || m.majorRoadPct == null) return 'unknown';
  if (m.majorRoadPct < 0.1) return 'low';
  if (m.majorRoadPct < 0.35) return 'medium';
  return 'high';
}

const measured = new WeakSet<Route>();

/** Loop routes: features derived from this route's own metrics. */
export function applyMeasuredAttributes(route: Route, m: RouteQualityMetrics): Route {
  route.rating = 0;
  route.features = { ...route.features, hasBenches: false, lit: undefined, trafficLoad: trafficLoadFromMetrics(m) };
  measured.add(route);
  return route;
}

/** Every other generated route: drop the invented values (measured loop routes keep theirs). */
export function applyHonestAttributes(routes: Route[]): Route[] {
  for (const r of routes) {
    if (measured.has(r)) continue;
    r.rating = 0;
    if (r.features) r.features = { ...r.features, hasBenches: false, lit: undefined, trafficLoad: 'unknown' };
  }
  return routes;
}
