/**
 * Explicit caps for the app's remaining browser list queries on the map
 * collections (data-exposure plan phase 1.4, 01.11.2026).
 *
 * Every list query the app still runs from the browser now carries a limit,
 * so a future rule can require `request.query.limit <= N` (plan phase 2,
 * owner-approved separately) without breaking the app. The caps are far above
 * any real per-query size today (largest city ≈ 6,100 street segments, ≈ 80
 * official routes), so results are unchanged; when one is ever hit,
 * `warnIfCapped` says so out loud instead of silently returning a clipped set.
 */
export const CLIENT_READ_CAPS = {
  /** official_routes for one city / authority (published corridors, curated, infrastructure). */
  routesPerCity: 1000,
  /** route_adjacency edges for one city. */
  adjacencyPerCity: 5000,
  /** street_segments in one geohash range of a radius search. */
  streetSegmentsPerRange: 10000,
} as const;

export function warnIfCapped(size: number, cap: number, label: string): void {
  if (size >= cap) {
    console.warn(`[client-read-caps] ${label} returned ${size} docs = cap ${cap}; results may be clipped, raise the cap.`);
  }
}
