/**
 * dem-tile-cache/dem-tile-fetch-live.node.ts — Node-only, server-side,
 * UNCACHED Terrain-RGB fetch + decode + sample. The live route editor's
 * fallback when the browser-side warmed cache (dem-tile-cache-client.ts)
 * misses.
 *
 * Why this exists: confirmed live (scripts/audit-city-coverage.ts's
 * findings, 29.08.2026) that Haifa/Ashkelon/Zichron-Yaakov routes already
 * have 100% real DEM-backed difficulty — computed once at import time by
 * scripts/geo-discovery-routes.ts's own elevAt/demProfile, which fetches
 * Mapbox Terrain-RGB tiles LIVE (scripts/geo-discovery-routes.ts:421). The
 * browser-side dem-tile-cache/ was only ever warmed for the TLV pilot, so
 * editing a Haifa-family route hit a cache miss and (correctly, per the
 * DEM-cache-miss guard) left elevation/difficulty untouched — meaning
 * STALE for the new, edited geometry, not wrong-but-honest. This module
 * closes that gap by giving the server a live-fetch path to the exact same
 * Mapbox Terrain-RGB source discovery already proved reachable for these
 * cities — same endpoint, same decode primitives (terrain-rgb-decode.node.ts,
 * itself a verbatim port of geo-discovery-routes.ts's own decodePNG), same
 * sampling math (dem-sampling.service.ts). One source of truth, not a third
 * DEM implementation.
 *
 * Deliberately does NOT write to Firebase Storage (unlike
 * dem-tile-cache-admin.node.ts's warmDemTileCache) — this is a live,
 * per-request sample for a single edited path at save time, not a
 * cache-warming batch job. No Firestore/Storage writes anywhere in this file.
 */
import * as https from 'https';
import { bboxToTileCoords, boundingBoxWithMargin, DEM_TILE_ZOOM, tileKey } from './tile-math';
import { decodePng, terrainRgbToElevationGrid } from './terrain-rgb-decode.node';
import { computeDemProfile, type ElevationGrid, type ElevationGridMap, type DemProfileResult } from './dem-sampling.service';

// Same margin generator-elevation.service.ts's browser-cache path already uses —
// keeps the two DEM-loading paths behaviorally aligned, not just structurally similar.
const BBOX_MARGIN_METERS = 300;

// Mirrors dem-tile-cache-admin.node.ts's fetchBuffer exactly (same proven
// pattern already live in this codebase for this exact endpoint) — not
// reinvented as a fetch()-based version.
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
    req.setTimeout(15000, () => req.destroy(new Error('socket timeout')));
  });
}

/**
 * Fetches + decodes whatever Terrain-RGB tiles cover `pathLatLng`'s bbox,
 * live, no caching, then samples an elevation profile. `pathLatLng` is
 * [lat, lng] — same convention computeDemProfile/dem-sampling.service.ts
 * already use, NOT the app's own [lng, lat] Route.path convention; callers
 * must convert.
 *
 * Returns null on ANY failure — missing token, every tile fetch failing, or
 * a genuine coverage gap along the path. Never a guessed/partial profile,
 * same discipline computeDemProfile itself already enforces. A caller
 * treating null as "leave difficulty/elevation out of the write" is
 * correct and matches route-geometry-edit.service.ts's existing guard.
 */
export async function fetchLiveDemProfile(
  pathLatLng: Array<[number, number]>,
  zoom: number = DEM_TILE_ZOOM,
): Promise<DemProfileResult | null> {
  if (pathLatLng.length < 2) return null;
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!token) return null;

  let bbox;
  try {
    bbox = boundingBoxWithMargin(pathLatLng.map(([lat, lng]) => ({ lat, lng })), BBOX_MARGIN_METERS);
  } catch {
    return null;
  }
  const coords = bboxToTileCoords(bbox, zoom);
  const tiles: ElevationGridMap = new Map();

  await Promise.all(
    coords.map(async (coord) => {
      try {
        const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${coord.z}/${coord.x}/${coord.y}.pngraw?access_token=${token}`;
        const buf = await fetchBuffer(url);
        const png = decodePng(buf);
        const values = terrainRgbToElevationGrid(png);
        const grid: ElevationGrid = { z: coord.z, x: coord.x, y: coord.y, size: png.width, values: Array.from(values) };
        tiles.set(tileKey(coord.z, coord.x, coord.y), grid);
      } catch {
        // Missing/failed tile — left absent. computeDemProfile treats any
        // coverage gap as null, never a guess (dem-sampling.service.ts).
      }
    }),
  );

  if (tiles.size === 0) return null;
  return computeDemProfile(pathLatLng, tiles, zoom);
}
