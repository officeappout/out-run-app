/**
 * route-source-line.ts — PURE: should the route detail view show the one-line
 * "מקור: OpenStreetMap" credit (linking to /legal/credits)?
 *
 * Behind `enable_osm_attribution` (default OFF). The OSM-origin test is the existing
 * `isOsmDerivedRoute` (route-attribution.ts) — one definition of "comes from OSM".
 * This line is additive to the ODbL credit that RouteDetailSheet already renders from
 * `routeDataCredits`; it does not replace it.
 */
import { isOsmDerivedRoute, type RouteCreditInput } from './route-attribution';

export const CREDITS_PATH = '/legal/credits';

export function shouldShowOsmSourceLine(
  route: RouteCreditInput | null | undefined,
  flagOn: boolean,
): boolean {
  return flagOn === true && isOsmDerivedRoute(route);
}
