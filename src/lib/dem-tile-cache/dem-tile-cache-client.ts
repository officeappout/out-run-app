/**
 * dem-tile-cache/dem-tile-cache-client.ts — browser-side loader for the DEM
 * tile cache. Reads the SAME already-decoded, plain-JSON elevation grids
 * dem-tile-cache-admin.node.ts writes to Firebase Storage — the browser
 * never decodes a Terrain-RGB PNG itself (Buffer/zlib, used by the Node
 * decode side, don't exist in a browser); it only ever fetches JSON that
 * was pre-decoded once, server/script-side, by the cache-warming step.
 *
 * Module-level in-memory cache so a single browser session doesn't re-fetch
 * the same tile from Storage twice across multiple route-generation calls
 * (e.g. a user regenerating a route several times, or several construction
 * sites needing overlapping tiles in the same session) — mirrors the exact
 * "load once, sample many" shape geo-discovery-routes.ts's own script-local
 * `tiles` Map already uses, just scoped to a browser tab's lifetime instead
 * of a script's process lifetime.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

'use client';

import { bboxToTileCoords, DEM_TILE_ZOOM, tileKey, type Bbox } from './tile-math';
import type { ElevationGrid, ElevationGridMap } from './dem-sampling.service';

const STORAGE_PREFIX = 'dem-tiles';

// Session-lifetime cache — never evicted (tile count per city is small,
// well within a reasonable in-memory budget; see admin-side module's own
// header for the per-tile size estimate this assumes).
const sessionTileCache: ElevationGridMap = new Map();
// Tiles confirmed absent from Storage (never warmed, or a 404) — cached
// too, so a missing tile isn't re-requested from Storage on every call
// within the same session.
const knownMissing = new Set<string>();

function storagePath(z: number, x: number, y: number): string {
  return `${STORAGE_PREFIX}/z${z}/${x}_${y}.json`;
}

/**
 * Loads every cached tile covering `bbox` into the session-lifetime cache
 * (skipping ones already loaded or already known-missing), then returns
 * the full accumulated map. A tile that was never warmed by the admin-side
 * cache (or genuinely has no coverage) is simply absent — callers treat a
 * coverage gap as "no real elevation data for this route," never a guess.
 *
 * Dynamic-imports `firebase/storage` at call time (not top-level) — this
 * module is only ever invoked from the generator's difficulty-construction
 * path, not on every map/app load, so there's no reason to pull the
 * Storage SDK into the main bundle eagerly.
 */
export async function loadCachedTilesClient(bbox: Bbox, zoom: number = DEM_TILE_ZOOM): Promise<ElevationGridMap> {
  const coords = bboxToTileCoords(bbox, zoom);
  const toFetch = coords.filter((c) => {
    const key = tileKey(c.z, c.x, c.y);
    return !sessionTileCache.has(key) && !knownMissing.has(key);
  });

  if (toFetch.length > 0) {
    const { ref, getBytes } = await import('firebase/storage');
    const { storage } = await import('@/lib/firebase');

    await Promise.all(
      toFetch.map(async (coord) => {
        const key = tileKey(coord.z, coord.x, coord.y);
        try {
          const bytes = await getBytes(ref(storage, storagePath(coord.z, coord.x, coord.y)));
          const grid = JSON.parse(new TextDecoder().decode(bytes)) as ElevationGrid;
          sessionTileCache.set(key, grid);
        } catch {
          knownMissing.add(key);
        }
      }),
    );
  }

  const result: ElevationGridMap = new Map();
  for (const coord of coords) {
    const key = tileKey(coord.z, coord.x, coord.y);
    const grid = sessionTileCache.get(key);
    if (grid) result.set(key, grid);
  }
  return result;
}
