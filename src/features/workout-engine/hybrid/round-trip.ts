/**
 * round-trip — walk-there / walk-back legs for the route_stops hybrid (Phase 2, 12.10.2026).
 *
 * The published-route backbone ('existing_route') can start up to ROUTE_STOPS_MAX_START_M from
 * the user. The composed session's own totals are WORKOUT-ONLY (aerobic + strength). A round trip
 * adds, ON TOP (never inside the time budget — targetKm / perStationMin / the engine are untouched):
 *   walk-there : user GPS → the entry vertex planFromPoint uses
 *   walk-back  : the traversal's final vertex → user GPS
 *
 * The fetch is the same Mapbox walking-Directions call useWalkToRoute makes (real duration, not a
 * distance guess), pointed at the backbone entry vertex. It deliberately does NOT import
 * useWalkToRoute / useMapStore (curated-route store) — only MapboxService, injected so the
 * composition stays unit-testable.
 */

import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import type { Topology } from './plan-from-point';

export interface LatLng { lat: number; lng: number; }

/** Durable pref (onboardingPrefs: localStorage + native Preferences mirror) — NEW key. */
export const ROUTE_STOPS_ROUND_TRIP_KEY = 'route_stops_round_trip';

/** PURE: default ON — only an explicit '0' turns it off (missing/malformed/stale → on). */
export function parseRoundTripPref(raw: string | null | undefined): boolean {
  return raw !== '0';
}
export function readRoundTripPref(): boolean {
  return parseRoundTripPref(getOnboardingPref(ROUTE_STOPS_ROUND_TRIP_KEY));
}

/**
 * PURE: out_and_back goes to the LINEAR bucket (nearer-endpoint behaviour, no round-trip
 * composition of its own). detectTopology only ever returns loop/one_way today — this is the
 * defensive mapping so a future out_and_back never silently takes the loop branch.
 */
export function bucketTopology(topology: Topology): 'loop' | 'one_way' {
  return topology === 'loop' ? 'loop' : 'one_way';
}

/** Below this the user is already "at" the point (mirrors useWalkToRoute's ARRIVAL_RADIUS_M). */
export const WALK_LEG_SKIP_M = 30;
const FALLBACK_WALK_M_PER_MIN = 80; // same straight-line pace useWalkToRoute's pre-fetch estimate uses

/** One walking leg. `fetchWalkSeconds` returns the real Mapbox duration, or null on failure. */
export type WalkSecondsFetcher = (from: LatLng, to: LatLng) => Promise<number | null>;

/** PURE+async: whole walking minutes between two points (0 when already there). */
export async function walkLegMinutes(
  from: LatLng,
  to: LatLng,
  fetchWalkSeconds: WalkSecondsFetcher,
): Promise<number> {
  const m = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (!Number.isFinite(m) || m <= WALK_LEG_SKIP_M) return 0;
  let seconds: number | null = null;
  try { seconds = await fetchWalkSeconds(from, to); } catch { seconds = null; }
  if (seconds != null && Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1, Math.round(seconds / 60));
  }
  // Network / API failure: never silently drop the leg from the total — straight-line estimate.
  return Math.max(1, Math.round(m / FALLBACK_WALK_M_PER_MIN));
}

/** The real fetch — same Mapbox walking Directions call useWalkToRoute makes (duration in s). */
export const fetchMapboxWalkSeconds: WalkSecondsFetcher = async (from, to) => {
  const { MapboxService } = await import('@/features/parks/core/services/mapbox.service');
  const result = await MapboxService.getSmartPath(
    { lng: from.lng, lat: from.lat },
    { lng: to.lng, lat: to.lat },
    'walking',
  );
  return result && Number.isFinite(result.duration) ? result.duration : null;
};

export interface RoundTripLegs {
  walkThereMin: number;
  walkBackMin: number;
}

/**
 * Compose both legs. `entry` = traversal[0] (the vertex planFromPoint snapped the user to),
 * `end` = traversal[last] (for a loop that is the entry again, so back ≈ there).
 */
export async function composeRoundTripLegs(
  user: LatLng,
  entry: LatLng,
  end: LatLng,
  fetchWalkSeconds: WalkSecondsFetcher,
): Promise<RoundTripLegs> {
  const [walkThereMin, walkBackMin] = await Promise.all([
    walkLegMinutes(user, entry, fetchWalkSeconds),
    walkLegMinutes(end, user, fetchWalkSeconds),
  ]);
  return { walkThereMin, walkBackMin };
}

/** PURE: the displayed total — workout minutes, plus both walk legs when round-trip is on. */
export function displayTotalMin(
  workoutMin: number,
  legs: RoundTripLegs | null | undefined,
  roundTripOn: boolean,
): number {
  if (!legs || !roundTripOn) return workoutMin;
  return workoutMin + legs.walkThereMin + legs.walkBackMin;
}
