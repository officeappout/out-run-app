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

export function formatApproxDistance(meters: number): string {
  if (meters < 100) return `${Math.round(meters)} מ׳`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} מ׳`;
  return `${(meters / 1000).toFixed(1)} ק"מ`;
}
