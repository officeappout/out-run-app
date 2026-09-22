/**
 * route-editor-geometry — pure helpers backing RouteEditor.tsx's freehand
 * drawing mode (22.09.2026, field-test doc 24 — satellite + freehand
 * drawing, David-approved).
 *
 * Plain .ts (not .tsx) specifically so it's unit-testable: RouteEditor.tsx
 * itself can't be pure-function-imported under this repo's vitest config —
 * verified directly (field-test doc 21): a .tsx file fails at transform
 * time (oxc/vite:define error), independent of the separate no-jsdom
 * limitation. Same reasoning as turn-carousel-logic.ts.
 */
import { haversineMeters } from '@/features/parks/core/services/geoUtils';

/**
 * Max gap (meters) between consecutive points after densifying a freehand
 * path. ~10m matches the spacing real route_stops-eligible routes already
 * have in practice (comparable to the real Sderot route's local vertex
 * spacing measured in earlier field-test verification) — dense enough that
 * deviation detection, entry-point snapping, and station ordering all
 * behave the same as on a road-snapped route.
 */
export const FREEHAND_DENSIFY_METERS = 10;

/**
 * Inserts evenly-spaced intermediate points along each segment of `path` so
 * no two consecutive points are more than `maxGapMeters` apart. Every
 * ORIGINAL vertex is preserved exactly (only new ones are inserted between
 * them) — this matters for a closeLoop-produced path, where the first and
 * last vertex must stay byte-identical for downstream loop detection
 * (detectTopology / isLoopPath) to work.
 *
 * Linear interpolation in lat/lng space — a negligible approximation at
 * this scale (tens of meters between points), the same simplification
 * already used elsewhere in this codebase for short-segment interpolation.
 *
 * With `path.length < 2` or every segment already ≤ maxGapMeters, returns
 * the input unchanged (by value, not necessarily by reference).
 */
export function densifyPath(
  path: [number, number][],
  maxGapMeters: number = FREEHAND_DENSIFY_METERS,
): [number, number][] {
  if (path.length < 2) return path;
  const out: [number, number][] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [lngA, latA] = path[i - 1];
    const [lngB, latB] = path[i];
    const distM = haversineMeters(latA, lngA, latB, lngB);
    if (!(distM > maxGapMeters)) {
      out.push(path[i]);
      continue;
    }
    const steps = Math.ceil(distM / maxGapMeters);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([lngA + (lngB - lngA) * t, latA + (latB - latA) * t]);
    }
  }
  return out;
}
