/**
 * entry-camera — pure decisions for the map's camera on ENTRY (mount).
 *
 * Root cause this exists for (map-entry camera jump, 17.10.2026): on the first
 * map entry of every browser session (cold launch / app killed after a long time
 * away) TWO owners moved the camera. AppMap opened at the seeded last-GPS spot
 * (initialViewState), and the old session-scoped `useFlyoverEntrance` hook —
 * which also suppressed the controller's own dive via `skipInitialZoom` — waited
 * for the first GPS fix (seconds later), then `jumpTo`'d to a zoom-6.5 country
 * view and flew back in over ~4s, after which the controller's dive fired too.
 * That is the reported "snaps to my location, then a few seconds later zooms out
 * and in again by itself". The flyover is gone; the camera controller is now the
 * only thing that moves the camera on entry, following ONE plan picked here.
 *
 *   'dive'        — legacy (flag off): today's single initial flyTo to zoom 15.
 *   'settle'      — home v2, later entries: straight to the location, no effect.
 *   'globe_intro' — home v2, first-ever entry: start on the whole globe and fly
 *                   down to the user in one smooth flyTo.
 */
import { haversineMeters } from '../services/geoUtils';

export type EntryCameraPlan = 'dive' | 'settle' | 'globe_intro';

export type LatLng = { lat: number; lng: number };

/** localStorage key — set once the first-entry globe flight has started. */
export const GLOBE_INTRO_SEEN_KEY = 'out_map_globe_intro_seen_v1';

/** Zoom of the "whole Earth" starting frame. */
export const GLOBE_INTRO_START_ZOOM = 1;
/** Where the camera lands at the end of every entry plan. */
export const ENTRY_TARGET_ZOOM = 15;
/** One smooth flight from space to the street. */
export const GLOBE_INTRO_DURATION_MS = 3600;
/** How long the globe waits for a location before flying to the best fallback. */
export const GLOBE_INTRO_MAX_WAIT_MS = 4000;
/** A post-landing correction smaller than this is not worth moving for. */
export const ENTRY_CORRECTION_MIN_M = 60;
/** Beyond this, a correction jumps instead of easing (an ease would be a long slide). */
export const ENTRY_CORRECTION_JUMP_M = 3000;

/** Israel-ish centre — the globe frame's longitude/latitude before any location. */
export const GLOBE_INTRO_FALLBACK_CENTER: LatLng = { lat: 31.5, lng: 34.85 };

function isFinitePoint(p: LatLng | null | undefined): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export function decideEntryCamera(input: {
  /** enable_home_v2 resolved (false while the flags are still loading). */
  homeV2: boolean;
  /** The globe intro already played on this device. */
  introSeen: boolean;
  /** prefers-reduced-motion: reduce. */
  prefersReducedMotion: boolean;
  /**
   * The entry already has a deliberate camera target (deep-linked spot,
   * pre-focused route…) — no globe flight then; that owner moves the camera.
   */
  hasOtherCameraIntent?: boolean;
}): EntryCameraPlan {
  if (!input.homeV2) return 'dive';
  if (input.introSeen || input.prefersReducedMotion || input.hasOtherCameraIntent) return 'settle';
  return 'globe_intro';
}

/**
 * Where the globe flight should land — or null to keep waiting on the globe.
 * Priority: the live fix → an accurate seed (the user's own last GPS fix) →
 * once the wait budget is spent, any coarse fallback (anchor) → Israel.
 */
export function pickGlobeIntroTarget(input: {
  currentLocation: LatLng | null | undefined;
  accurateSeed: LatLng | null | undefined;
  coarseFallback: LatLng | null | undefined;
  waitedMs: number;
  maxWaitMs?: number;
}): LatLng | null {
  if (isFinitePoint(input.currentLocation)) return input.currentLocation;
  if (isFinitePoint(input.accurateSeed)) return input.accurateSeed;
  if (input.waitedMs < (input.maxWaitMs ?? GLOBE_INTRO_MAX_WAIT_MS)) return null;
  if (isFinitePoint(input.coarseFallback)) return input.coarseFallback;
  return GLOBE_INTRO_FALLBACK_CENTER;
}

/**
 * After the entry camera has landed somewhere, should a later (better) fix move
 * it — and how? 'none' when close enough, 'ease' for a short glide, 'jump' when
 * far away (or when the map is still hidden behind the loading skeleton).
 */
export function entryCorrection(
  landedAt: LatLng | null | undefined,
  live: LatLng | null | undefined,
  opts: { mapHidden?: boolean } = {},
): 'none' | 'ease' | 'jump' {
  if (!isFinitePoint(live)) return 'none';
  if (!isFinitePoint(landedAt)) return 'jump';
  const d = haversineMeters(landedAt.lat, landedAt.lng, live.lat, live.lng);
  if (d < ENTRY_CORRECTION_MIN_M) return 'none';
  if (opts.mapHidden || d > ENTRY_CORRECTION_JUMP_M) return 'jump';
  return 'ease';
}

/** Cubic ease-in-out (0→1), for the globe flight. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function readGlobeIntroSeen(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(GLOBE_INTRO_SEEN_KEY) === '1';
  } catch {
    // Storage blocked → treat as seen, so a broken storage never replays the
    // flight on every entry.
    return true;
  }
}

export function markGlobeIntroSeen(): void {
  try {
    window.localStorage.setItem(GLOBE_INTRO_SEEN_KEY, '1');
  } catch {
    /* private mode / quota — worst case the flight plays once more */
  }
}

export function readPrefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
