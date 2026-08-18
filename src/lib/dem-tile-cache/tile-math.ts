/**
 * dem-tile-cache/tile-math.ts — pure Web Mercator tile math for Mapbox
 * Terrain-RGB tiles. Zero I/O, zero environment-specific APIs (no Buffer,
 * no fetch) — safe to import from Node scripts, Next.js server code, and
 * the browser-side generator alike.
 *
 * Formulas match `geo-discovery-routes.ts`'s existing private
 * `lon2gx`/`lat2gy` (scripts/geo-discovery-routes.ts:201-202) exactly —
 * verified equivalent, not reinvented — so tile keys computed here are
 * interchangeable with that script's own in-memory DEM cache. That script
 * keeps its own copy rather than importing this module (out of scope for
 * this build to refactor a working, unrelated script); consolidating the
 * two is a reasonable, low-risk follow-up, not done here.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

/** Terrain-RGB zoom level used throughout this cache — matches the existing
 * geo-discovery-routes.ts DEM code's own Z=14 choice, so any future
 * consolidation of the two doesn't also have to reconcile a resolution
 * mismatch. ~9-10m/pixel at Tel Aviv's latitude. */
export const DEM_TILE_ZOOM = 14;

export interface Bbox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

const TILE_SIZE = 256;

/** Fractional global pixel X at the given zoom (Web Mercator). */
export function lonToGlobalPixelX(lon: number, zoom: number): number {
  const nTiles = 2 ** zoom;
  return ((lon + 180) / 360) * TILE_SIZE * nTiles;
}

/** Fractional global pixel Y at the given zoom (Web Mercator). */
export function latToGlobalPixelY(lat: number, zoom: number): number {
  const nTiles = 2 ** zoom;
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE_SIZE * nTiles;
}

export function tileKey(z: number, x: number, y: number): string {
  return `${z}_${x}_${y}`;
}

/**
 * All tile coordinates covering a bbox at the given zoom — inclusive range,
 * so edge tiles are always fully covered (never a half-tile gap at the
 * bbox boundary).
 */
export function bboxToTileCoords(bbox: Bbox, zoom: number = DEM_TILE_ZOOM): TileCoord[] {
  const txMin = Math.floor(lonToGlobalPixelX(bbox.lonMin, zoom) / TILE_SIZE);
  const txMax = Math.floor(lonToGlobalPixelX(bbox.lonMax, zoom) / TILE_SIZE);
  const tyMin = Math.floor(latToGlobalPixelY(bbox.latMax, zoom) / TILE_SIZE);
  const tyMax = Math.floor(latToGlobalPixelY(bbox.latMin, zoom) / TILE_SIZE);
  const coords: TileCoord[] = [];
  for (let x = txMin; x <= txMax; x++) {
    for (let y = tyMin; y <= tyMax; y++) {
      coords.push({ z: zoom, x, y });
    }
  }
  return coords;
}

/**
 * Tight bbox around a set of [lat, lng] points, expanded by a margin so
 * bilinear sampling at the edge points always has valid neighbor pixels
 * (a point sitting exactly on a bbox edge would otherwise sample past the
 * fetched tile range). marginMeters converted to degrees via a simple
 * latitude-corrected approximation — sufficient for a margin, not a
 * precision distance calc.
 */
export function boundingBoxWithMargin(points: Array<{ lat: number; lng: number }>, marginMeters: number): Bbox {
  if (points.length === 0) throw new Error('boundingBoxWithMargin: points must be non-empty');
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of points) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lng < lonMin) lonMin = p.lng;
    if (p.lng > lonMax) lonMax = p.lng;
  }
  const midLat = (latMin + latMax) / 2;
  const latMarginDeg = marginMeters / 111_320; // ~meters per degree latitude, constant
  const lonMarginDeg = marginMeters / (111_320 * Math.cos((midLat * Math.PI) / 180));
  return {
    latMin: latMin - latMarginDeg,
    latMax: latMax + latMarginDeg,
    lonMin: lonMin - lonMarginDeg,
    lonMax: lonMax + lonMarginDeg,
  };
}
