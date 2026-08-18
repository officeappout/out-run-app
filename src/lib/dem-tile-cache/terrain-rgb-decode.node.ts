/**
 * dem-tile-cache/terrain-rgb-decode.node.ts — Node-only PNG decode +
 * Terrain-RGB → elevation conversion for Mapbox's `mapbox.terrain-rgb`
 * tileset. Uses Buffer/zlib (Node built-ins) — NOT importable from browser
 * code. This is the one-time "warm the cache" side; the cache-warmed
 * output (a plain elevation grid) is what browser code actually consumes
 * (see dem-sampling.service.ts) — the browser never needs to decode a PNG.
 *
 * PNG decode + Terrain-RGB decode formula are lifted verbatim from
 * `geo-discovery-routes.ts`'s existing, working, live-in-production
 * `decodePNG` (scripts/geo-discovery-routes.ts:203-208) — same filter
 * types (None/Sub/Up/Average/Paeth), same channel-count handling. Not
 * reinvented; that script keeps its own private copy (consolidating the
 * two is a reasonable follow-up, out of scope for this build — see
 * tile-math.ts's header for the same note).
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase B (DEM tile cache),
 * autonomous build run 18.08.2026.
 */

import * as zlib from 'zlib';

export interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

/** Minimal PNG decoder — enough for Mapbox's Terrain-RGB tiles (8-bit RGB/RGBA). */
export function decodePng(buf: Buffer): DecodedPng {
  let p = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const rawValue = raw[pos++];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let value = rawValue;
      if (filterType === 1) value = rawValue + a;
      else if (filterType === 2) value = rawValue + b;
      else if (filterType === 3) value = rawValue + ((a + b) >> 1);
      else if (filterType === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        value = rawValue + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Mapbox Terrain-RGB decode formula (official spec):
 *   elevation = -10000 + (R * 256 * 256 + G * 256 + B) * 0.1
 * Returns a flat row-major array of elevations in meters, one per pixel.
 */
export function terrainRgbToElevationGrid(png: DecodedPng): Float64Array {
  const { width, height, channels, data } = png;
  const out = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    out[i] = -10000 + (data[idx] * 65536 + data[idx + 1] * 256 + data[idx + 2]) * 0.1;
  }
  return out;
}
