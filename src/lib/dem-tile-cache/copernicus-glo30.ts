/**
 * dem-tile-cache/copernicus-glo30.ts — pure (browser-safe, no I/O) half of
 * the Copernicus DEM GLO-30 elevation provider (trails pilot, 18.10.2026).
 *
 * WHY THIS EXISTS: every elevation number we STORE (elevationGain, maxGrade,
 * trail-segment gain/loss) used to come from decoding Mapbox Terrain-RGB
 * tiles. Mapbox's terms forbid extracting/caching data from their tiles for
 * storage, so stored elevation moves to Copernicus GLO-30 (free, open,
 * attribution required — see COPERNICUS_DEM_ATTRIBUTION). Mapbox terrain
 * stays for map DISPLAY only (hillshade/3D), never for persisted numbers.
 *
 * Tiles: 1°×1°, named by their SOUTH-WEST corner, e.g. N31 E034 covers
 * lat 31..32, lon 34..35. Below 50° latitude a tile is 3600×3600 float32
 * samples at 1 arc-second, PixelIsPoint (sample (0,0) sits exactly on the
 * tile's NW corner). Sea is 0; there is no NODATA inside land.
 */
import type { Bbox } from './tile-math';
import type { ElevationGrid } from './dem-sampling.service';

export const COPERNICUS_DEM_ATTRIBUTION =
  'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';
/** Short form for tight UI (credits screen should still show the full one). */
export const COPERNICUS_DEM_ATTRIBUTION_SHORT = 'produced using Copernicus WorldDEM-30 © DLR/Airbus';

/** Public AWS Open Data bucket (no auth, no requester-pays). */
export const COPERNICUS_GLO30_BASE_URL = 'https://copernicus-dem-30m.s3.amazonaws.com';

/** 1° tiles covering Israel incl. Judea & Samaria, the Golan and Eilat. */
export const ISRAEL_COPERNICUS_TILES: ReadonlyArray<{ lat: number; lon: number }> = [
  { lat: 29, lon: 34 }, { lat: 29, lon: 35 },
  { lat: 30, lon: 34 }, { lat: 30, lon: 35 },
  { lat: 31, lon: 34 }, { lat: 31, lon: 35 },
  { lat: 32, lon: 34 }, { lat: 32, lon: 35 },
  { lat: 33, lon: 35 },
];

export interface CopernicusTile {
  /** South-west corner, integer degrees. */
  lat: number;
  lon: number;
  width: number;
  height: number;
  /** Longitude / latitude of sample (0,0)'s CENTER (NW corner for PixelIsPoint). */
  lon0: number;
  lat0: number;
  stepLon: number;
  stepLat: number;
  values: Float32Array;
}

function pad(n: number, w: number): string {
  return String(Math.abs(n)).padStart(w, '0');
}

/** Copernicus_DSM_COG_10_N31_00_E034_00_DEM */
export function copernicusTileName(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `Copernicus_DSM_COG_10_${ns}${pad(lat, 2)}_00_${ew}${pad(lon, 3)}_00_DEM`;
}

export function copernicusTileUrl(lat: number, lon: number): string {
  const name = copernicusTileName(lat, lon);
  return `${COPERNICUS_GLO30_BASE_URL}/${name}/${name}.tif`;
}

export function copernicusTileKey(lat: number, lon: number): string {
  return `${lat}_${lon}`;
}

/** Every 1° tile (SW corners) touching `bbox`. */
export function copernicusTilesForBbox(bbox: Bbox): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  for (let lat = Math.floor(bbox.latMin); lat <= Math.floor(bbox.latMax); lat++) {
    for (let lon = Math.floor(bbox.lonMin); lon <= Math.floor(bbox.lonMax); lon++) out.push({ lat, lon });
  }
  return out;
}

export type CopernicusTileSet = Map<string, CopernicusTile>;

function sampleAt(tiles: CopernicusTileSet, lat: number, lng: number): number | null {
  const t = tiles.get(copernicusTileKey(Math.floor(lat), Math.floor(lng)));
  if (!t) return null;
  const fx = (lng - t.lon0) / t.stepLon;
  const fy = (t.lat0 - lat) / t.stepLat;
  const x0 = Math.max(0, Math.min(t.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(t.height - 1, Math.floor(fy)));
  const x1 = Math.min(t.width - 1, x0 + 1);
  const y1 = Math.min(t.height - 1, y0 + 1);
  const dx = Math.max(0, Math.min(1, fx - x0));
  const dy = Math.max(0, Math.min(1, fy - y0));
  const v = (x: number, y: number) => t.values[y * t.width + x];
  const e00 = v(x0, y0), e10 = v(x1, y0), e01 = v(x0, y1), e11 = v(x1, y1);
  if (![e00, e10, e01, e11].every((e) => Number.isFinite(e) && e > -1000)) return null;
  return e00 * (1 - dx) * (1 - dy) + e10 * dx * (1 - dy) + e01 * (1 - dx) * dy + e11 * dx * dy;
}

/** Bilinear elevation (m) at lat/lng, or null outside loaded coverage. */
export function sampleCopernicus(tiles: CopernicusTileSet, lat: number, lng: number): number | null {
  return sampleAt(tiles, lat, lng);
}

/**
 * Resamples Copernicus into the EXISTING dem-tile-cache format (a web-
 * mercator z/x/y 256×256 `ElevationGrid`) so every current consumer —
 * computeDemProfile, the browser loader, the Storage cache — can be re-
 * warmed from a storable source without changing its interface. Returns
 * null when any pixel falls outside loaded coverage (never a partial tile).
 */
export function copernicusToElevationGrid(tiles: CopernicusTileSet, z: number, x: number, y: number, size = 256): ElevationGrid | null {
  const values: number[] = new Array(size * size);
  const n = 2 ** z;
  for (let py = 0; py < size; py++) {
    const gy = (y * size + py) / (size * n);
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180) / Math.PI;
    for (let px = 0; px < size; px++) {
      const lng = ((x * size + px) / (size * n)) * 360 - 180;
      const e = sampleAt(tiles, lat, lng);
      if (e == null) return null;
      values[py * size + px] = Math.round(e * 10) / 10;
    }
  }
  return { z, x, y, size, values };
}
