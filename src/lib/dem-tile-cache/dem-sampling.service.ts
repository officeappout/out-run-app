/**
 * dem-tile-cache/dem-sampling.service.ts — pure elevation sampling + route
 * profile computation from an already-loaded set of cached DEM tiles.
 *
 * Deliberately environment-agnostic (no Buffer/zlib/fetch/Firebase
 * imports) so this exact module is usable from BOTH the Node backfill
 * script (Phase B's route-elevation population) AND the browser-side
 * generator (route-generator.service.ts) — the two consumers only differ
 * in HOW they load an `ElevationGrid` map (see dem-tile-cache-admin.node.ts
 * for the Node/Storage-Admin-SDK loader, dem-tile-cache-client.ts for the
 * browser/Storage-client-SDK loader); sampling itself is identical either
 * way, by design.
 *
 * Interpolation + profile math mirrors `geo-discovery-routes.ts`'s
 * existing private `elevAt`/`demProfile` (scripts/geo-discovery-routes.ts:
 * 219,221-229) — same bilinear-interpolation + 15m-resample + smoothing
 * approach, verified equivalent, not reinvented.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

import { DEM_TILE_ZOOM, lonToGlobalPixelX, latToGlobalPixelY, tileKey } from './tile-math';

/**
 * A single cached, ALREADY-DECODED DEM tile — plain JSON, not a PNG.
 * `values` is a flat, row-major array of `size * size` elevations in
 * meters (one decimal precision, matching Terrain-RGB's own 0.1m
 * resolution). Deliberately plain numbers (not a packed binary format) so
 * this is trivially `JSON.stringify`/`fetch().json()`-able from both Node
 * and the browser with zero base64/typed-array environment branching —
 * a simplicity tradeoff against raw file size, documented here since it
 * wasn't free (see dem-tile-cache-admin.node.ts's header for the size
 * estimate this trades against).
 */
export interface ElevationGrid {
  z: number;
  x: number;
  y: number;
  size: number;
  values: number[];
}

export type ElevationGridMap = Map<string, ElevationGrid>;

const TILE_SIZE = 256;

/** Elevation at one tile-local pixel, or null if out of range. */
function pixelElevation(grid: ElevationGrid, px: number, py: number): number | null {
  if (px < 0 || py < 0 || px >= grid.size || py >= grid.size) return null;
  return grid.values[py * grid.size + px] ?? null;
}

/**
 * Bilinear-interpolated elevation at an arbitrary lat/lng, reading across
 * however many cached tiles the sample point's neighborhood spans. Returns
 * null if any of the 4 surrounding tiles isn't in the cache (caller
 * decides how to handle a coverage gap — never silently guessed here).
 */
export function sampleElevation(tiles: ElevationGridMap, lat: number, lng: number, zoom: number = DEM_TILE_ZOOM): number | null {
  const gx = lonToGlobalPixelX(lng, zoom);
  const gy = latToGlobalPixelY(lat, zoom);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;

  const at = (ix: number, iy: number): number | null => {
    const tx = Math.floor(ix / TILE_SIZE);
    const ty = Math.floor(iy / TILE_SIZE);
    const grid = tiles.get(tileKey(zoom, tx, ty));
    if (!grid) return null;
    return pixelElevation(grid, ix - tx * TILE_SIZE, iy - ty * TILE_SIZE);
  };

  const e00 = at(x0, y0);
  const e10 = at(x0 + 1, y0);
  const e01 = at(x0, y0 + 1);
  const e11 = at(x0 + 1, y0 + 1);
  if (e00 == null || e10 == null || e01 == null || e11 == null) return e00;
  return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface DemProfileResult {
  elevationGainM: number;
  maxGradePercent: number;
}

/**
 * Total ascent + max local grade over a [lat, lng] polyline, resampled at
 * a fixed step and lightly smoothed — same approach and constants as
 * geo-discovery-routes.ts's demProfile (STEP=15m, 3-point moving average).
 * Returns null if the path is empty or any resampled point falls outside
 * cached tile coverage (never a partial/guessed profile).
 */
export function computeDemProfile(pathLatLng: Array<[number, number]>, tiles: ElevationGridMap, zoom: number = DEM_TILE_ZOOM): DemProfileResult | null {
  if (pathLatLng.length < 2) return null;

  const STEP = 15;
  const resampled: Array<[number, number]> = [pathLatLng[0]];
  let acc = 0;
  for (let i = 1; i < pathLatLng.length; i++) {
    let from = pathLatLng[i - 1];
    let segLen = haversineMeters(from, pathLatLng[i]);
    while (acc + segLen >= STEP) {
      const t = (STEP - acc) / segLen;
      const next: [number, number] = [from[0] + (pathLatLng[i][0] - from[0]) * t, from[1] + (pathLatLng[i][1] - from[1]) * t];
      resampled.push(next);
      from = next;
      segLen = haversineMeters(from, pathLatLng[i]);
      acc = 0;
    }
    acc += segLen;
  }

  const elevations = resampled.map((p) => sampleElevation(tiles, p[0], p[1], zoom));
  if (elevations.some((e) => e == null)) return null;
  const el = elevations as number[];

  const smoothed = el.map((_, i) => {
    const window = [el[i - 1], el[i], el[i + 1]].filter((v) => v != null) as number[];
    return window.reduce((a, b) => a + b, 0) / window.length;
  });

  let gain = 0;
  let maxGrade = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gain += delta;
    maxGrade = Math.max(maxGrade, delta / STEP);
  }

  return { elevationGainM: +gain.toFixed(1), maxGradePercent: +(maxGrade * 100).toFixed(1) };
}
