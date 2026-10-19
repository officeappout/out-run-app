/**
 * Loops prefer our routes (panel flag enable_loops_prefer_official, default
 * OFF) — generated loops pass along OUR mapped routes when they are nearby
 * (we know their quality, level and elevation):
 *   - v1 (Mapbox): waypoint seeds ON our routes mixed with the quiet-street
 *     candidates (route-seeds.ts) + a ranking bonus by share on our routes
 *     (ranking.ts). Applies only together with enable_route_quality_v1.
 *   - GraphHopper: our routes go to /api/routes/generate as a buffered custom
 *     area with a priority boost + a scoring bonus (src/lib/routing/our-routes).
 * Off → generateDynamicRoutes never calls into this module.
 */
export { resolveLoopsPreferOfficial } from './flag';
export {
  prepareOurRoutes, loadOurRoutesNear, mapOfficialRoutesFetcher, toOurRouteLines, clearOurRoutesCache,
  OUR_ROUTES_WAIT_MS, type OurRoutesContext, type OurRoutesFetcher,
} from './our-routes-source';
export { seedsFromOurRoutes, withOurRouteSeeds, SEED_STEP_M, MAX_SEEDS, SEED_RING } from './route-seeds';
export { ourRoutesRankFactor, rankFactorForPath, OUR_ROUTES_RANK_WEIGHT } from './ranking';
export { ourRoutesSources } from './sources';
