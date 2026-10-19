/**
 * Our mapped routes (official / curated) in GraphHopper loop generation —
 * flag enable_loops_prefer_official: a buffered custom area with a priority
 * boost (area.ts), the wire format the app sends them in (wire.ts) and the
 * share-on-our-routes ranking weight. Pure, no I/O.
 */
export { buildOurRoutesArea, OUR_ROUTES_AREA_ID, OUR_ROUTES_AREA_BUFFER_M, OUR_ROUTES_AREA_MAX_BYTES, type OurRoutesAreaResult } from './area';
export { toWireOurRoutes, parseWireOurRoutes, WIRE_MAX_ROUTES, WIRE_MAX_POINTS, type WireOurRoute } from './wire';
export { simplifyLineM, clipLineToRadius } from './simplify';

/**
 * GraphHopper custom model: priority multiplier for every edge OUTSIDE our
 * routes' area (all priorities stay <= 1, like the parks rule) — i.e. edges on
 * our routes are 1 / 0.7 ≈ 1.4× preferred. Tunable.
 */
export const OUTSIDE_OUR_ROUTES_PRIORITY = '0.7';

/**
 * GraphHopper loop score (lower = better): minus this × share on our routes.
 * 0.3 at 100 % on our routes ≈ the same as 15 % less distance error (the score
 * weighs |distance error| ×2) and never outweighs failing the v1 bars (+10).
 */
export const OUR_ROUTES_GH_SCORE_WEIGHT = 0.3;

/** Loop radius (km) inside which our routes matter for a target: a loop rarely strays further than target/3 from its start. */
export const ourRoutesRadiusKm = (targetKm: number) => Math.max(targetKm, 1.5) / 3 + 0.3;
