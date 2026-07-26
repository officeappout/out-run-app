/**
 * Single source of truth for reading a STORED official_routes geometry.
 *
 * `official_routes.path` is written as an array of `{lng, lat}` OBJECTS
 * (see InventoryService.saveRoutes) — NOT as `[lng, lat]` tuples, even though
 * the runtime `Route.path` type is `[number, number][]`. Manually-drawn routes
 * (RouteEditor) may instead store `[lng, lat]` tuples. Any code that reads a raw
 * route document must go through this normaliser, or it will mis-read the shape
 * (e.g. treating `{lng,lat}` objects as invalid and reporting a false "NaN").
 *
 * Accepts all three shapes — `[lng,lat]` tuples, `{lng,lat}` / `{lat,lng}` and
 * `{longitude,latitude}` objects — and returns finite `[lng, lat]` tuples,
 * dropping any corrupt (non-finite) point.
 */
export type LngLat = [number, number];

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Coerce one stored path element to a finite `[lng, lat]` tuple, or null if corrupt. */
export function toLngLat(p: any): LngLat | null {
  if (Array.isArray(p)) {
    return isFiniteNum(p[0]) && isFiniteNum(p[1]) ? [p[0], p[1]] : null;
  }
  if (p && typeof p === 'object') {
    const lng = p.lng ?? p.longitude;
    const lat = p.lat ?? p.latitude;
    return isFiniteNum(lng) && isFiniteNum(lat) ? [lng, lat] : null;
  }
  return null;
}

/** Normalise a raw stored `path` to finite `[lng, lat]` tuples (corrupt points dropped). */
export function normalizeStoredRoutePath(rawPath: unknown): LngLat[] {
  if (!Array.isArray(rawPath)) return [];
  const out: LngLat[] = [];
  for (const p of rawPath) {
    const c = toLngLat(p);
    if (c) out.push(c);
  }
  return out;
}
