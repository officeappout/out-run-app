/**
 * geoValidation
 * -------------
 * Shared coordinate-validation helpers for everything that hands data to
 * Mapbox GL. Mapbox's `LngLat`, `LngLatBounds`, and the `<Marker>` /
 * `<Popup>` props all throw a hard exception the moment they receive
 * `NaN`, `Infinity`, `null`, `undefined`, a string, or anything that
 * isn't a finite JS number — `LngLat invalid: NaN, NaN`. A single bad
 * coordinate from a still-warming GPS fix or a malformed route path
 * blanks the entire map.
 *
 * Every consumer (AppMap, TurnCarousel, future map clients) MUST run
 * coordinates through these helpers before passing them to Mapbox so a
 * bad input only surfaces as a `console.warn` instead of an unmount.
 *
 * Convention:
 *   • `isFiniteNum`     → primitive number guard (rejects NaN/Infinity)
 *   • `isFiniteLngLat`  → tuple `[lng, lat]` guard
 *   • `isFiniteLatLng`  → object `{ lat, lng }` guard (RouteTurn shape)
 *   • `isFiniteBounds`  → 2x2 nested-tuple guard for `fitBounds`
 *
 * Centralising this means TWO things in practice:
 *   1. We can never accidentally apply a different "valid" rule in
 *      different call-sites — the type predicate IS the rule.
 *   2. A future tightening (e.g. clamping to ±180 / ±90) lands in one
 *      file, not seven.
 */

/** Primitive guard. Rejects NaN, Infinity, null, undefined, strings. */
export const isFiniteNum = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Tuple guard for `[lng, lat]` payloads (the GeoJSON / Mapbox order).
 * Returns true only when BOTH the array shape and BOTH coordinates pass
 * `isFiniteNum`. Acts as a TypeScript type predicate so callers can
 * destructure safely after the check.
 */
export const isFiniteLngLat = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length === 2 && isFiniteNum(c[0]) && isFiniteNum(c[1]);

/**
 * Object guard for `{ lat, lng }` payloads (the RouteTurn / GPS shape).
 * Different from `isFiniteLngLat` — different ergonomic shape, same
 * underlying rule. Both CO-EXIST because the codebase carries the two
 * shapes interchangeably and forcing every call site to convert before
 * validating would be its own foot-gun.
 */
export const isFiniteLatLng = (
  c: { lat?: unknown; lng?: unknown } | null | undefined,
): c is { lat: number; lng: number } => {
  if (!c || typeof c !== 'object') return false;
  return isFiniteNum((c as { lat: unknown }).lat)
    && isFiniteNum((c as { lng: unknown }).lng);
};

/**
 * Nested-tuple guard for the `[[swLng, swLat], [neLng, neLat]]` payload
 * accepted by `mapbox.fitBounds`. Composes `isFiniteLngLat` so a future
 * tightening of "what counts as a valid lng/lat" automatically applies
 * to bounds checks too.
 */
export const isFiniteBounds = (
  b: unknown,
): b is [[number, number], [number, number]] =>
  Array.isArray(b)
    && b.length === 2
    && isFiniteLngLat(b[0])
    && isFiniteLngLat(b[1]);

/**
 * Convenience: bearing/zoom/pitch numeric coercion. Mapbox accepts
 * `bearing: number` strictly; passing NaN spins the camera randomly.
 * Use `safeNumber(value, fallback)` at every Mapbox boundary instead
 * of inline `Number.isFinite ? value : fallback` so the fallback is
 * impossible to forget.
 */
export const safeNumber = (n: unknown, fallback: number): number =>
  isFiniteNum(n) ? n : fallback;
