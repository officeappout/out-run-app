/**
 * dem-tile-cache/dem-tile-cache-admin.node.ts — Node/Admin-SDK-only side of
 * the DEM tile cache: fetches Terrain-RGB tiles from Mapbox, decodes them
 * ONCE, and stores the decoded elevation grid (plain JSON — see
 * dem-sampling.service.ts's ElevationGrid doc comment for why) to Firebase
 * Storage under `dem-tiles/z{Z}/{x}_{y}.json`. Also loads already-cached
 * tiles for a bbox, for callers that just need to sample (the Node-side
 * backfill script; the browser has its own client-SDK loader,
 * dem-tile-cache-client.ts, but the sampling math is 100% shared —
 * dem-sampling.service.ts).
 *
 * Cost control (the whole point of caching): warmDemTileCache checks
 * Storage for an existing tile before ever calling Mapbox — a tile is
 * fetched from Mapbox AT MOST ONCE, ever, unless `force` is passed. Repeat
 * runs of any script against the same bbox cost zero additional Mapbox API
 * calls once the cache is warm.
 *
 * Uses the raw `firebase-admin` package directly (admin.storage()), same
 * convention every other backfill script in this plan already uses for
 * Firestore (admin.initializeApp with a service-account cred) — NOT
 * src/lib/firebase-admin.ts, which carries `import 'server-only'` and is
 * Next.js-API-route-only; these scripts run standalone via `tsx`.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

import * as https from 'https';
import type * as admin from 'firebase-admin';
import { bboxToTileCoords, DEM_TILE_ZOOM, tileKey, type Bbox, type TileCoord } from './tile-math';
import { decodePng, terrainRgbToElevationGrid } from './terrain-rgb-decode.node';
import type { ElevationGrid, ElevationGridMap } from './dem-sampling.service';

const STORAGE_PREFIX = 'dem-tiles';

function storagePath(z: number, x: number, y: number): string {
  return `${STORAGE_PREFIX}/z${z}/${x}_${y}.json`;
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Terrain-RGB fetch failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('socket timeout')));
  });
}

export interface WarmCacheResult {
  requested: number;
  alreadyCached: number;
  fetchedFromMapbox: number;
  failed: Array<{ tile: TileCoord; error: string }>;
}

/**
 * Fetches + decodes + uploads every tile covering `bbox` at `zoom` that
 * isn't already in Storage. Requires a Mapbox token (same env var the
 * existing geo-discovery-routes.ts DEM code already reads) and an
 * initialized `firebase-admin` app passed in by the caller (this module
 * never calls `admin.initializeApp` itself — the caller script owns that,
 * same separation every other backfill script in this plan already keeps).
 */
export async function warmDemTileCache(
  storage: admin.storage.Storage,
  bbox: Bbox,
  opts: { zoom?: number; force?: boolean; dryRun?: boolean } = {},
): Promise<WarmCacheResult> {
  const zoom = opts.zoom ?? DEM_TILE_ZOOM;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const coords = bboxToTileCoords(bbox, zoom);
  const bucket = storage.bucket();

  const result: WarmCacheResult = { requested: coords.length, alreadyCached: 0, fetchedFromMapbox: 0, failed: [] };

  if (!token) {
    throw new Error('warmDemTileCache: NEXT_PUBLIC_MAPBOX_TOKEN not set — cannot fetch Terrain-RGB tiles');
  }

  for (const coord of coords) {
    const path = storagePath(coord.z, coord.x, coord.y);
    const file = bucket.file(path);

    if (!opts.force) {
      const [exists] = await file.exists();
      if (exists) {
        result.alreadyCached++;
        continue;
      }
    }

    if (opts.dryRun) {
      // Dry-run: report what WOULD be fetched, make no Mapbox call, no Storage write.
      result.fetchedFromMapbox++;
      continue;
    }

    try {
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${coord.z}/${coord.x}/${coord.y}.pngraw?access_token=${token}`;
      const pngBuf = await fetchBuffer(url);
      const png = decodePng(pngBuf);
      const values = terrainRgbToElevationGrid(png);
      const grid: ElevationGrid = { z: coord.z, x: coord.x, y: coord.y, size: png.width, values: Array.from(values) };
      await file.save(JSON.stringify(grid), { contentType: 'application/json' });
      result.fetchedFromMapbox++;
    } catch (err) {
      result.failed.push({ tile: coord, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/**
 * Loads every already-cached tile covering `bbox` from Storage into an
 * in-memory map ready for dem-sampling.service.ts. Tiles missing from the
 * cache (never warmed, or warmDemTileCache failed on them) are simply
 * absent from the returned map — sampleElevation/computeDemProfile treat
 * a coverage gap as `null`, never a silent guess.
 */
export async function loadCachedTiles(
  storage: admin.storage.Storage,
  bbox: Bbox,
  zoom: number = DEM_TILE_ZOOM,
): Promise<ElevationGridMap> {
  const coords = bboxToTileCoords(bbox, zoom);
  const bucket = storage.bucket();
  const tiles: ElevationGridMap = new Map();

  for (const coord of coords) {
    const path = storagePath(coord.z, coord.x, coord.y);
    try {
      const [buf] = await bucket.file(path).download();
      const grid = JSON.parse(buf.toString('utf8')) as ElevationGrid;
      tiles.set(tileKey(coord.z, coord.x, coord.y), grid);
    } catch {
      // Not cached (or a transient read error) — leave the gap, caller's
      // sampling functions handle a missing tile as null, never guessed.
    }
  }

  return tiles;
}
