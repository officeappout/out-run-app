/**
 * walk-approach — pure decisions for the walk-to-route ("approach") line while a
 * workout is ACTIVE (useWalkToRoute.ts's active branch).
 *
 * Bug this backs (active-run-map fix, 17.10.2026): pressing Play on a route
 * whose start is away from the user never drew the dashed path to the route.
 *   1. A route workout without a planned session runs in mode 'free_run', where
 *      FreeRunLayer mounts its OWN AppMap (MapShell's is unmounted) — a fresh
 *      useWalkToRoute instance with an empty per-route cache. The active branch
 *      only ever re-used a line fetched in discover mode, so on that fresh
 *      instance it always cleared → the line never appeared.
 *   2. Even when the line did survive (mode 'active'), a flat 60 s fallback hid
 *      it long before a 5–15 minute walk to the route was over.
 *
 * Pure — no React, no network — so it is unit-tested directly.
 */

/** Floor for how long the approach line may stay up after the workout starts. */
export const MIN_APPROACH_MS = 60_000;

/**
 * How long the approach line may stay up: twice the real walking time to the
 * route (a slow walker, a red light, a wrong turn), never less than 60 s.
 * Unknown walk time → the 60 s floor (the previous fixed behaviour).
 */
export function approachBudgetMs(walkMinutes: number | null | undefined): number {
  if (walkMinutes == null || !Number.isFinite(walkMinutes) || walkMinutes <= 0) {
    return MIN_APPROACH_MS;
  }
  return Math.max(MIN_APPROACH_MS, Math.round(walkMinutes * 2 * 60_000));
}

export type ActiveApproachDecision =
  /** No line yet for this route and none was attempted in this session → fetch one now. */
  | 'fetch'
  /** Keep the current line as is. */
  | 'keep'
  /** The user reached the route (its target point, or anywhere on the line) → clear for good. */
  | 'arrived'
  /** The approach budget ran out → clear for good. */
  | 'timeout'
  /** Nothing to draw (fetch already attempted / in flight, gated, or failed). */
  | 'none';

export interface ActiveApproachInput {
  /** A result (drawn or gated) is cached for this route. */
  hasCache: boolean;
  /** The cached result actually has a line (geoJSON). */
  hasLine: boolean;
  /** A fetch was already started for this route during this workout. */
  fetchAttempted: boolean;
  /** Already marked arrived/timed-out for this route. */
  alreadyDone: boolean;
  /** ms since the workout started; null when unknown. */
  elapsedMs: number | null;
  /** Cached walking minutes (real or estimated). */
  walkMinutes: number | null;
  /** Metres from the user to the line's target point; null when unknown. */
  distToTargetM: number | null;
  /** Metres from the user to the nearest point of the route polyline; null when unknown. */
  distToRouteM: number | null;
  arrivalRadiusM: number;
}

export function decideActiveApproach(i: ActiveApproachInput): ActiveApproachDecision {
  if (i.alreadyDone) return 'arrived';
  // Already ON the route (started on it, or joined it somewhere other than the
  // target point) — an approach line would only point backwards.
  if (i.distToRouteM != null && i.distToRouteM <= i.arrivalRadiusM) return 'arrived';
  if (!i.hasCache) return i.fetchAttempted ? 'none' : 'fetch';
  if (!i.hasLine) return 'none';
  if (i.elapsedMs != null && i.elapsedMs > approachBudgetMs(i.walkMinutes)) return 'timeout';
  if (i.distToTargetM != null && i.distToTargetM <= i.arrivalRadiusM) return 'arrived';
  return 'keep';
}
