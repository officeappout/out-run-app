/**
 * hybrid-intro-format — pure distance formatting for the start-of-walk intro
 * (G3.1, Sderot field test, 10.10.2026). Split into a plain .ts module so it's
 * actually unit-testable (this repo's vitest cannot import .tsx files at all).
 *
 * Deliberately NOT importing TurnCarousel.tsx's own formatDistance() — that
 * function is private (unexported) and TurnCarousel.tsx is a map/nav file a
 * specific person owns; writing even an `export` into it is out of scope
 * here. Same rounding convention, written independently.
 */

import { withUnit } from '@/lib/i18n/units';
import { aerobicKindLabel } from './aerobic-kind';

export function formatApproxDistance(meters: number): string {
  if (meters < 100) return withUnit('m', Math.round(meters));
  if (meters < 1000) return withUnit('m', Math.round(meters / 10) * 10);
  return withUnit('kmAscii', (meters / 1000).toFixed(1));
}

/** End-of-station screen (G2.4): planned leg to the next station as whole minutes (≥1). */
export function formatApproxWalkMinutes(seconds: number, kind: 'walking' | 'running' | 'cycling' = 'walking'): string {
  const min = Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : 1;
  return `${withUnit('min', min)} ${aerobicKindLabel(kind)}`;
}
