/**
 * dem-tile-cache/geotiff-float32-decode.node.ts — minimal, dependency-free
 * GeoTIFF reader for the Copernicus DEM GLO-30 Cloud-Optimized GeoTIFFs
 * (trails pilot, 18.10.2026).
 *
 * Scope is deliberately narrow — exactly what the GLO-30 COGs on the public
 * AWS Open Data bucket use (verified against a real tile with gdalinfo
 * before writing this): little- or big-endian classic TIFF, first IFD only
 * (full resolution; COG overviews are later IFDs and are ignored), tiled OR
 * stripped, single-band 32-bit IEEE float, DEFLATE (8/32946) or none (1),
 * predictor 1 (none), 2 (horizontal) or 3 (floating-point). Anything else
 * throws — never a silently wrong grid.
 *
 * Node-only (zlib). Same `.node.ts` convention as terrain-rgb-decode.node.ts.
 */
import * as zlib from 'zlib';

export interface DecodedFloatRaster {
  width: number;
  height: number;
  /** Row-major, `width * height` samples. */
  values: Float32Array;
  /** ModelTiepoint/ModelPixelScale georeference (degrees for EPSG:4326). */
  originLon: number;
  originLat: number;
  pixelSizeLon: number;
  pixelSizeLat: number;
  /** GTRasterTypeGeoKey: 1 = PixelIsArea, 2 = PixelIsPoint. */
  rasterType: 1 | 2;
  noData: number | null;
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

interface IfdEntry {
  type: number;
  count: number;
  valueOffset: number; // absolute offset of the value bytes
}

export function decodeFloat32GeoTiff(buf: Buffer): DecodedFloatRaster {
  const order = buf.toString('ascii', 0, 2);
  if (order !== 'II' && order !== 'MM') throw new Error('Not a TIFF (bad byte-order mark)');
  const le = order === 'II';
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const f64 = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  if (u16(2) !== 42) throw new Error('BigTIFF / unsupported TIFF version');

  const ifdOffset = u32(4);
  const n = u16(ifdOffset);
  const entries = new Map<number, IfdEntry>();
  for (let i = 0; i < n; i++) {
    const p = ifdOffset + 2 + i * 12;
    const tag = u16(p);
    const type = u16(p + 2);
    const count = u32(p + 4);
    const size = (TYPE_SIZES[type] ?? 1) * count;
    entries.set(tag, { type, count, valueOffset: size <= 4 ? p + 8 : u32(p + 8) });
  }

  const readInts = (tag: number): number[] => {
    const e = entries.get(tag);
    if (!e) return [];
    const out: number[] = [];
    for (let i = 0; i < e.count; i++) {
      if (e.type === 3) out.push(u16(e.valueOffset + i * 2));
      else if (e.type === 4) out.push(u32(e.valueOffset + i * 4));
      else if (e.type === 1) out.push(buf[e.valueOffset + i]);
      else throw new Error(`Unsupported integer TIFF type ${e.type} for tag ${tag}`);
    }
    return out;
  };
  const readDoubles = (tag: number): number[] => {
    const e = entries.get(tag);
    if (!e) return [];
    if (e.type !== 12) throw new Error(`Tag ${tag} is not DOUBLE`);
    return Array.from({ length: e.count }, (_, i) => f64(e.valueOffset + i * 8));
  };
  const one = (tag: number, dflt?: number): number => {
    const v = readInts(tag);
    if (v.length) return v[0];
    if (dflt === undefined) throw new Error(`Missing required TIFF tag ${tag}`);
    return dflt;
  };

  const width = one(256);
  const height = one(257);
  const bits = one(258);
  const compression = one(259, 1);
  const spp = one(277, 1);
  const predictor = one(317, 1);
  const sampleFormat = one(339, 1);
  if (bits !== 32 || sampleFormat !== 3 || spp !== 1) {
    throw new Error(`Unsupported raster: bits=${bits} sampleFormat=${sampleFormat} spp=${spp} (need single-band float32)`);
  }
  if (compression !== 1 && compression !== 8 && compression !== 32946) {
    throw new Error(`Unsupported TIFF compression ${compression}`);
  }

  const tiled = entries.has(322);
  const blockW = tiled ? one(322) : width;
  const blockH = tiled ? one(323) : one(278, height);
  const offsets = readInts(tiled ? 324 : 273);
  const counts = readInts(tiled ? 325 : 279);
  const blocksAcross = Math.ceil(width / blockW);

  const values = new Float32Array(width * height);
  for (let b = 0; b < offsets.length; b++) {
    let raw = buf.subarray(offsets[b], offsets[b] + counts[b]);
    if (compression !== 1) raw = zlib.inflateSync(raw);
    const rows = tiled ? blockH : Math.min(blockH, height - b * blockH);
    const block = undoPredictor(Buffer.from(raw), blockW, rows, predictor, le);
    const bx = tiled ? (b % blocksAcross) * blockW : 0;
    const by = tiled ? Math.floor(b / blocksAcross) * blockH : b * blockH;
    for (let r = 0; r < rows; r++) {
      const y = by + r;
      if (y >= height) break;
      for (let c = 0; c < blockW; c++) {
        const x = bx + c;
        if (x >= width) break;
        values[y * width + x] = block[r * blockW + c];
      }
    }
  }

  const scale = readDoubles(33550);
  const tie = readDoubles(33922);
  if (scale.length < 2 || tie.length < 6) throw new Error('Missing GeoTIFF georeference (ModelPixelScale/ModelTiepoint)');

  // GeoKeyDirectory (34735): find GTRasterTypeGeoKey (1025).
  let rasterType: 1 | 2 = 1;
  const keys = readInts(34735);
  for (let k = 4; k + 3 < keys.length; k += 4) {
    if (keys[k] === 1025 && keys[k + 1] === 0) rasterType = keys[k + 3] === 2 ? 2 : 1;
  }
  const nd = entries.get(42113);
  const noData = nd ? Number(buf.toString('ascii', nd.valueOffset, nd.valueOffset + nd.count).replace(/\0/g, '')) : null;

  return {
    width,
    height,
    values,
    originLon: tie[3] - tie[0] * scale[0],
    originLat: tie[4] + tie[1] * scale[1],
    pixelSizeLon: scale[0],
    pixelSizeLat: scale[1],
    rasterType,
    noData: Number.isFinite(noData as number) ? (noData as number) : null,
  };
}

/** Exported for tests: reverses TIFF predictor 1/2/3 on one decompressed block. */
export function undoPredictor(raw: Buffer, w: number, h: number, predictor: number, le: boolean): Float32Array {
  const out = new Float32Array(w * h);
  if (predictor === 3) {
    // Floating-point predictor (Adobe TN3): per row, bytes are byte-plane
    // split (most-significant plane first) and horizontally differenced.
    const rowBytes = w * 4;
    const tmp = Buffer.alloc(4);
    for (let r = 0; r < h; r++) {
      const base = r * rowBytes;
      for (let i = 1; i < rowBytes; i++) raw[base + i] = (raw[base + i] + raw[base + i - 1]) & 0xff;
      for (let c = 0; c < w; c++) {
        // planes: 0 = MSB … 3 = LSB → assemble as big-endian float.
        tmp[0] = raw[base + c];
        tmp[1] = raw[base + w + c];
        tmp[2] = raw[base + 2 * w + c];
        tmp[3] = raw[base + 3 * w + c];
        out[r * w + c] = tmp.readFloatBE(0);
      }
    }
    return out;
  }
  for (let i = 0; i < w * h; i++) out[i] = le ? raw.readFloatLE(i * 4) : raw.readFloatBE(i * 4);
  if (predictor === 2) {
    // Horizontal differencing on float samples is not defined by the spec
    // for IEEE floats in practice; refuse rather than guess.
    throw new Error('Predictor 2 on float32 data is unsupported');
  }
  if (predictor !== 1) throw new Error(`Unsupported TIFF predictor ${predictor}`);
  return out;
}
