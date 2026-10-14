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

/** A fetched walking leg: Mapbox duration (s) + its street geometry ([lng,lat][]). */
export interface FetchedWalkLeg { seconds: number; path: [number, number][]; }
/** Returns null on failure (the caller then falls back to a straight-line time estimate). */
export type WalkLegFetcher = (from: LatLng, to: LatLng) => Promise<FetchedWalkLeg | null>;

export interface WalkLeg {
  minutes: number;
  /** Real street geometry for drawing; null when already there OR the fetch failed (no guessed line). */
  path: [number, number][] | null;
}

/** PURE+async: one walking leg (0 min, no path when already there). */
export async function walkLeg(from: LatLng, to: LatLng, fetchLeg: WalkLegFetcher): Promise<WalkLeg> {
  const m = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (!Number.isFinite(m) || m <= WALK_LEG_SKIP_M) return { minutes: 0, path: null };
  let fetched: FetchedWalkLeg | null = null;
  try { fetched = await fetchLeg(from, to); } catch { fetched = null; }
  if (fetched && Number.isFinite(fetched.seconds) && fetched.seconds >= 0) {
    return {
      minutes: Math.max(1, Math.round(fetched.seconds / 60)),
      path: fetched.path && fetched.path.length >= 2 ? fetched.path : null,
    };
  }
  // Network / API failure: never silently drop the leg from the total — straight-line estimate.
  return { minutes: Math.max(1, Math.round(m / FALLBACK_WALK_M_PER_MIN)), path: null };
}

/** The real fetch — same Mapbox walking Directions call useWalkToRoute makes. */
export const fetchMapboxWalkLeg: WalkLegFetcher = async (from, to) => {
  const { MapboxService } = await import('@/features/parks/core/services/mapbox.service');
  const result = await MapboxService.getSmartPath(
    { lng: from.lng, lat: from.lat },
    { lng: to.lng, lat: to.lat },
    'walking',
  );
  if (!result || !Number.isFinite(result.duration)) return null;
  return { seconds: result.duration, path: result.path };
};

export interface RoundTripLegs {
  walkThereMin: number;
  walkBackMin: number;
  /** Street geometry for the map line; null → leg not drawn. */
  walkTherePath: [number, number][] | null;
  walkBackPath: [number, number][] | null;
  /** LOOP: the traversal end is (within WALK_LEG_SKIP_M of) the entry, so walk-back retraces
   *  walk-there. Display-only — the map draws ONE line; both legs still count in the time. */
  walkBackOverlapsThere?: boolean;
}

/**
 * Compose both legs. `entry` = traversal[0] (the vertex planFromPoint snapped the user to),
 * `end` = traversal[last] (for a loop that is the entry again, so back ≈ there).
 */
export async function composeRoundTripLegs(
  user: LatLng,
  entry: LatLng,
  end: LatLng,
  fetchLeg: WalkLegFetcher,
): Promise<RoundTripLegs> {
  const [there, back] = await Promise.all([
    walkLeg(user, entry, fetchLeg),
    walkLeg(end, user, fetchLeg),
  ]);
  return {
    walkThereMin: there.minutes, walkBackMin: back.minutes,
    walkTherePath: there.path, walkBackPath: back.path,
    ...(haversineMeters(entry.lat, entry.lng, end.lat, end.lng) <= WALK_LEG_SKIP_M ? { walkBackOverlapsThere: true } : {}),
  };
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

/**
 * PURE: the map overlay for the walk legs — a FeatureCollection of up to two LineStrings (ONE on a loop, where back overlaps there), or null
 * when round-trip is off / nothing is drawable. Rendered by AppMap with the SAME paint as the
 * walk-to-route line (WALK_LEG_LINE_PAINT).
 */
export function buildWalkLegsGeoJSON(
  legs: RoundTripLegs | null | undefined,
  roundTripOn: boolean,
): GeoJSON.FeatureCollection | null {
  if (!legs || !roundTripOn) return null;
  const features: GeoJSON.Feature[] = [];
  if (legs.walkTherePath) features.push({ type: 'Feature', properties: { leg: 'there' }, geometry: { type: 'LineString', coordinates: legs.walkTherePath } });
  // Loop: walk-back overlaps walk-there — draw one line (their dot phases would interleave).
  // Only dedupe when walk-there IS drawn; otherwise walk-back is the only line we have.
  const dedupeBack = !!legs.walkBackOverlapsThere && !!legs.walkTherePath;
  if (legs.walkBackPath && !dedupeBack) features.push({ type: 'Feature', properties: { leg: 'back' }, geometry: { type: 'LineString', coordinates: legs.walkBackPath } });
  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
}

/**
 * PURE: the workout-only minutes of a composed plan (aerobic + strength, same rounding the
 * overview uses), or null when there is nothing real to show (stub/gated plans with no segments,
 * or a zero total). null → the carousel card shows NO time (never a guessed number).
 */
export function composedWorkoutMin(plan: {
  segments: readonly unknown[];
  totals: { aerobicMin?: number; strengthMin?: number };
}): number | null {
  if (!plan.segments || plan.segments.length === 0) return null;
  const m = Math.round((plan.totals.aerobicMin ?? 0) + (plan.totals.strengthMin ?? 0));
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** What the route_stops carousel card shows: the overview's total (same inputs), or null. */
export interface CardTotal {
  min: number;
  includesWalk: boolean;
  /** ~kcal of the composed workout (plan.totals.estCalories, excludes the walk legs). Absent → not shown. */
  calories?: number;
  /** Strength stops on the route (plan.totals.stations). Absent → not shown. */
  stations?: number;
}

/** PURE: the card's secondary outcome stats from a composed plan's totals — only real, positive numbers. */
export function composedCardStats(plan: {
  totals: { estCalories?: number; stations?: number };
}): { calories?: number; stations?: number } {
  const out: { calories?: number; stations?: number } = {};
  const kcal = plan.totals?.estCalories;
  if (typeof kcal === 'number' && Number.isFinite(kcal) && Math.round(kcal) > 0) out.calories = Math.round(kcal);
  const st = plan.totals?.stations;
  if (typeof st === 'number' && Number.isFinite(st) && st > 0) out.stations = Math.round(st);
  return out;
}

export function cardTotalFor(
  workoutMin: number | null,
  legs: RoundTripLegs | null | undefined,
  roundTripOn: boolean,
  extras?: { calories?: number; stations?: number },
): CardTotal | null {
  if (workoutMin == null) return null;
  const min = displayTotalMin(workoutMin, legs, roundTripOn);
  const includesWalk = !!legs && roundTripOn && legs.walkThereMin + legs.walkBackMin > 0;
  return {
    min,
    includesWalk,
    ...(extras?.calories != null ? { calories: extras.calories } : {}),
    ...(extras?.stations != null ? { stations: extras.stations } : {}),
  };
}
