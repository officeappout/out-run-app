/**
 * Fast-first location fix for the onboarding location step (enable_home_v2).
 *
 * Why: the legacy GPS-button path asks for ONE high-accuracy fix with
 * `maximumAge: 0` and a 10s timeout. On a first run (cold GPS, no cached
 * fix) that is the slowest possible request — the device must get a fresh
 * satellite lock — and the user stares at "מאתרים את המיקום שלך..." the
 * whole time, then at the serial geocode → authority → neighborhood →
 * route → parks chain on top.
 *
 * Strategy here:
 *   1. COARSE first — low accuracy (Wi-Fi / cell) and an allowed recent
 *      cached fix (maximumAge), short timeout. Usually answers in well under
 *      a second, so the map can fly to the user immediately.
 *   2. If the coarse request times out / has no signal (NOT on a denial),
 *      fall back to one PRECISE request with a capped timeout.
 *   3. If the first fix was coarse (or of unknown / poor accuracy), the
 *      caller requests a PRECISE fix in the background and re-centres only
 *      when it moved meaningfully (shouldApplyRefinedFix).
 *
 * Everything here is pure / dependency-injected so it is unit-tested without
 * a device; the real requester is useGPSStore.getState().requestFix.
 */

import type { GPSCoords, GPSFixOptions, GPSFixResult } from '@/features/parks/core/store/useGPSStore';
import { calculateDistance } from './location-utils';

/** Coarse first fix: network location, a cached fix up to 5 min old is fine. */
export const COARSE_FIX_OPTIONS: GPSFixOptions = {
  enableHighAccuracy: false,
  timeout: 4000,
  maximumAge: 5 * 60 * 1000,
};

/**
 * Precise fallback when the coarse request produced nothing. Capped so the
 * worst case (coarse timeout + precise timeout) stays ≈ 12s, after which the
 * step shows its error + manual-search fallback.
 */
export const PRECISE_FALLBACK_OPTIONS: GPSFixOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 0,
};

/** Background refinement after a coarse first fix (same as the legacy request). */
export const PRECISE_REFINE_OPTIONS: GPSFixOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

/** A first fix at least this accurate (metres) is not refined. */
export const GOOD_ENOUGH_ACCURACY_METERS = 100;

/** A refined fix re-centres the map only when it moved more than this. */
export const REFINE_MIN_SHIFT_METERS = 75;

/** The "search manually instead" link appears on the locating sheet after this. */
export const LOCATING_MANUAL_SEARCH_HINT_MS = 4000;

/** Hard cap on the Mapbox reverse-geocode request in the v2 GPS path. */
export const REVERSE_GEOCODE_TIMEOUT_MS = 6000;

export type FixRequester = (options: GPSFixOptions) => Promise<GPSFixResult>;

export interface FirstFix {
  coords: GPSCoords;
  /** True when this fix should be refined by a background precise request. */
  needsRefine: boolean;
}

export type FirstFixResult =
  | { status: 'ok'; fix: FirstFix }
  | { status: 'denied' }
  | { status: 'unavailable' };

/** Pure: does a first fix warrant a background precise refinement? */
export function needsRefinement(coords: GPSCoords, wasCoarseRequest: boolean): boolean {
  if (!wasCoarseRequest) return false;
  if (typeof coords.accuracy !== 'number' || !Number.isFinite(coords.accuracy)) return true;
  return coords.accuracy > GOOD_ENOUGH_ACCURACY_METERS;
}

/**
 * Pure: should a refined (precise) fix replace the first one on screen?
 * Only when it is a real fix that moved further than REFINE_MIN_SHIFT_METERS
 * — re-running the lookups for a few metres of jitter would just flicker.
 */
export function shouldApplyRefinedFix(first: GPSCoords, refined: GPSCoords | null): boolean {
  if (!refined) return false;
  if (!Number.isFinite(refined.lat) || !Number.isFinite(refined.lng)) return false;
  return calculateDistance(first.lat, first.lng, refined.lat, refined.lng) > REFINE_MIN_SHIFT_METERS;
}

/**
 * Coarse first, precise fallback. A denial short-circuits (never re-prompts).
 */
export async function getFirstFix(request: FixRequester): Promise<FirstFixResult> {
  const coarse = await request(COARSE_FIX_OPTIONS);
  if (coarse.reason === 'denied') return { status: 'denied' };
  if (coarse.coords) {
    return { status: 'ok', fix: { coords: coarse.coords, needsRefine: needsRefinement(coarse.coords, true) } };
  }

  const precise = await request(PRECISE_FALLBACK_OPTIONS);
  if (precise.reason === 'denied') return { status: 'denied' };
  if (precise.coords) {
    return { status: 'ok', fix: { coords: precise.coords, needsRefine: false } };
  }
  return { status: 'unavailable' };
}
