/**
 * cycling-pace — the ONE cycling speed / calorie assumption for route planning
 * (cycling-fixes-v1, docs/routes/BIKE-GENERATOR-AUDIT.md item 15).
 *
 * Before: the drawer + route filter planned at 20 km/h, while inventory.service, the
 * dataset-import and trail-graph doc builders used 250 m/min (15 km/h), and known-route
 * `bike` docs were stamped with RUNNING pace (160 m/min) and the running 65 kcal/km.
 *
 * Pure, no I/O, no feature imports — shared utilities belong in src/lib.
 * route-request.utils.ts (SPEED_KMH / KCAL_PER_KM) re-derives its cycling values from here.
 */

/** Planning speed for a bike ride. Equals the previous SPEED_KMH.cycling. */
export const CYCLING_SPEED_KMH = 20;

/** Planning energy for a bike ride. Equals the previous KCAL_PER_KM.cycling. */
export const CYCLING_KCAL_PER_KM = 25;

/** The older 15 km/h figure (250 m/min) — kept ONLY for the flag-off / legacy doc builders. */
export const LEGACY_CYCLING_M_PER_MIN = 250;

/** Minutes to ride one km at the planning speed (3 at 20 km/h). */
export const CYCLING_MIN_PER_KM = 60 / CYCLING_SPEED_KMH;

/** Meters per minute at the planning speed (~333). */
export function cyclingMetersPerMin(unified: boolean): number {
  return unified ? (CYCLING_SPEED_KMH * 1000) / 60 : LEGACY_CYCLING_M_PER_MIN;
}

/** Ride duration in whole minutes (>= 1) for a length in meters at the planning speed. */
export function cyclingMinutesForMeters(lengthM: number): number {
  return Math.max(1, Math.round(lengthM / cyclingMetersPerMin(true)));
}

/** Calories for a ride of `km` at the planning rate. */
export function cyclingKcalForKm(km: number): number {
  return Math.round(km * CYCLING_KCAL_PER_KM);
}
