/**
 * start-experience-state — pure classification of the user's position
 * relative to a route's start, for the "start experience" state map
 * (field feedback, 11.10.2026): at start / on route / off-route-but-walkable
 * / off-route-too-far-to-start-directly. Shared by every entry point that
 * can start a route or hybrid session (discover CTA, hybrid overview,
 * FreeRun's own route picker) so all three behave identically — this is
 * the "wire it once" piece; each entry point's UI reads this, none of them
 * re-implement the decision.
 *
 * SAFETY (critical, live product): this function FAILS OPEN. Whenever
 * required data is missing (no live position, no route geometry, no real
 * walk-time computed yet), it returns 'on_route' — the same "just start,
 * no gate" treatment as a user who's genuinely on the route — rather than
 * the blocking 'off_route_too_far' state. A start that works today must
 * never be blocked because some upstream value hasn't arrived yet.
 *
 * Pure — no React, no Firebase, no Date.now().
 */

import { nearestPointOnPath } from './geoUtils';
import { ARRIVAL_RADIUS_M } from '../hooks/useWalkToRoute';

export { ARRIVAL_RADIUS_M };

/**
 * Cross-track distance (metres) from the route path at which the user is
 * still considered "on the route," not off it. Mirrors
 * useRunningPlayer.ts's ROUTE_DEVIATION_THRESHOLD_M (40m) — the existing,
 * already-tuned mid-workout deviation threshold — rather than inventing a
 * new number. Kept as a literal (not imported) because useRunningPlayer.ts
 * is a different domain (workout-engine/players) and this module lives in
 * parks/core services — cross-domain imports are avoided per this repo's
 * domain-agnostic rule (CLAUDE.md law 7). If that constant ever changes,
 * this one should too — the comment is the link between them.
 */
export const ON_ROUTE_CROSS_TRACK_M = 40;

/** The core ask's 15-minute walking-time threshold. */
export const WALK_TO_ROUTE_THRESHOLD_MIN = 15;

export type StartExperienceState =
  | 'at_start'
  | 'on_route'
  | 'off_route_walkable'
  | 'off_route_too_far';

/**
 * @param userPos live GPS position, or null/undefined if not yet available.
 * @param routePath the route's geometry ([lng,lat][]), or null/undefined
 *   for a routeless workout (e.g. a plain strength session) — always
 *   resolves to 'on_route' (no gate) in that case, since there is nothing
 *   to walk to.
 * @param walkMinutes the real (or best-available estimate of) walking time
 *   in minutes from userPos to the route's start, or null/undefined if not
 *   yet computed.
 */
export function computeStartExperienceState(
  userPos: { lat: number; lng: number } | null | undefined,
  routePath: number[][] | null | undefined,
  walkMinutes: number | null | undefined,
): StartExperienceState {
  if (!userPos || !Number.isFinite(userPos.lat) || !Number.isFinite(userPos.lng)) return 'on_route';
  if (!routePath || routePath.length < 2) return 'on_route';

  // Single nearest-point projection feeds BOTH checks below — the TRUE
  // nearest point on the polyline (start-experience-v2 Phase 1, 12.10.2026),
  // not just routePath[0] (the pre-fix behavior here, inconsistent with
  // useWalkToRoute.ts's own walk-leg target, which this same fix changed
  // from "the nearer endpoint" to this identical projection). Fails open
  // to 'on_route' when the path is degenerate — nearestPointOnPath already
  // returns null in that case.
  const nearest = nearestPointOnPath(userPos, routePath);
  if (!nearest) return 'on_route';

  if (nearest.crossTrackM <= ARRIVAL_RADIUS_M) return 'at_start';
  if (nearest.crossTrackM <= ON_ROUTE_CROSS_TRACK_M) return 'on_route';

  if (walkMinutes == null || !Number.isFinite(walkMinutes)) return 'on_route';
  return walkMinutes <= WALK_TO_ROUTE_THRESHOLD_MIN ? 'off_route_walkable' : 'off_route_too_far';
}

/**
 * Best-available walking-minutes estimate for a route card that ISN'T the
 * single currently-focused one (useWalkToRoute only computes a real
 * Mapbox-fetched duration for the focused route — a carousel can show
 * several cards at once). Mirrors the exact formula useWalkToRoute.ts used
 * for EVERY route before this fix (distance / 80 m-per-min) — now scoped
 * to only the non-focused fallback case, where a rough estimate is still
 * better than treating every unfocused card as always-startable.
 */
export function estimateWalkMinutesFromKm(distanceKm: number | null | undefined): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return Math.max(1, Math.round((distanceKm * 1000) / 80));
}
