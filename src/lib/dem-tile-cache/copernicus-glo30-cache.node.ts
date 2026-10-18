/**
 * dem-tile-cache/copernicus-glo30-cache.node.ts — Node-only LOCAL disk cache
 * for Copernicus DEM GLO-30 1° GeoTIFF tiles (trails pilot, 18.10.2026).
 *
 * Tiles are downloaded once from the public AWS Open Data bucket into a
 * gitignored directory (default `<repo>/.cache/dem/copernicus-glo30`,
 * override with COPERNICUS_DEM_CACHE_DIR) and NEVER committed. No Firebase,
 * no Storage, no Firestore here — reading/writing local files only.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Bbox } from './tile-math';
import { decodeFloat32GeoTiff } from './geotiff-float32-decode.node';
import {
  copernicusTileKey,
  copernicusTileName,
  copernicusTileUrl,
  copernicusTilesForBbox,
  sampleCopernicus,
  COPERNICUS_DEM_ATTRIBUTION,
  type CopernicusTile,
  type CopernicusTileSet,
} from './copernicus-glo30';
import type { ElevationProvider } from './elevation-provider';

export function copernicusCacheDir(): string {
  return process.env.COPERNICUS_DEM_CACHE_DIR || path.resolve(process.cwd(), '.cache/dem/copernicus-glo30');
}

/**
 * Downloads any missing tile in `bbox` to the local cache. Ocean-only tiles
 * don't exist on the bucket (HTTP 404/403) — recorded as absent, not an error.
 */
export async function ensureCopernicusTiles(bbox: Bbox, log: (m: string) => void = console.log): Promise<{ present: string[]; missingUpstream: string[] }> {
  const dir = copernicusCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const present: string[] = [];
  const missingUpstream: string[] = [];
  for (const { lat, lon } of copernicusTilesForBbox(bbox)) {
    const file = path.join(dir, `${copernicusTileName(lat, lon)}.tif`);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      present.push(file);
      continue;
    }
    const url = copernicusTileUrl(lat, lon);
    log(`[copernicus] downloading ${url}`);
    const res = await fetch(url);
    if (res.status === 404 || res.status === 403) {
      missingUpstream.push(copernicusTileName(lat, lon));
      continue;
    }
    if (!res.ok) throw new Error(`Copernicus tile download failed: HTTP ${res.status} for ${url}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(`${file}.part`, bytes);
    fs.renameSync(`${file}.part`, file);
    present.push(file);
  }
  return { present, missingUpstream };
}

export function loadCopernicusTile(lat: number, lon: number): CopernicusTile | null {
  const file = path.join(copernicusCacheDir(), `${copernicusTileName(lat, lon)}.tif`);
  if (!fs.existsSync(file)) return null;
  const r = decodeFloat32GeoTiff(fs.readFileSync(file));
  const half = r.rasterType === 2 ? 0 : 0.5;
  return {
    lat,
    lon,
    width: r.width,
    height: r.height,
    lon0: r.originLon + half * r.pixelSizeLon,
    lat0: r.originLat - half * r.pixelSizeLat,
    stepLon: r.pixelSizeLon,
    stepLat: r.pixelSizeLat,
    values: r.values,
  };
}

/** Loads every cached tile touching `bbox` (downloading missing ones first). */
export async function loadCopernicusProvider(bbox: Bbox, opts: { download?: boolean } = {}): Promise<ElevationProvider & { tiles: CopernicusTileSet }> {
  if (opts.download !== false) await ensureCopernicusTiles(bbox);
  const tiles: CopernicusTileSet = new Map();
  for (const { lat, lon } of copernicusTilesForBbox(bbox)) {
    const t = loadCopernicusTile(lat, lon);
    if (t) tiles.set(copernicusTileKey(lat, lon), t);
  }
  return {
    id: 'copernicus-glo30',
    attribution: COPERNICUS_DEM_ATTRIBUTION,
    storable: true,
    tiles,
    sample: (lat, lng) => sampleCopernicus(tiles, lat, lng),
  };
}
