/**
 * route-stops-duration.util — the route_stops duration-chip constants + the durable
 * "remember my last pick" read/validate logic. Extracted from HybridSlotCarousel.tsx (a .tsx
 * file) so this pure logic is directly unit-testable without a JSX/DOM test environment
 * (this project has no React-Testing-Library / jsdom precedent — see vitest.config.ts).
 *
 * Durable via onboardingPrefs (localStorage + native Preferences mirror) — NOT sessionStorage
 * (must survive app relaunch) and NOT Firestore (no adaptive/learning engine here, just the
 * last explicit choice). Default 30min (WHO 150min/week ÷ 5 sessions) when nothing is
 * remembered yet.
 */

import { getOnboardingPref } from '@/lib/onboardingPrefs';

export const ROUTE_STOPS_DURATION_KEY = 'route_stops_duration_min';
export const ROUTE_STOPS_DURATION_CHOICES = [15, 30, 45] as const;
export const ROUTE_STOPS_DURATION_DEFAULT = 30;

/** PURE — validates a raw pref string against the chip choices; falls back to the default for
 *  anything missing/malformed/stale (e.g. an old choice set removed in a future revision). */
export function parseRememberedRouteStopsDuration(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  return (ROUTE_STOPS_DURATION_CHOICES as readonly number[]).includes(n) ? n : ROUTE_STOPS_DURATION_DEFAULT;
}

export function readRememberedRouteStopsDuration(): number {
  return parseRememberedRouteStopsDuration(getOnboardingPref(ROUTE_STOPS_DURATION_KEY));
}
