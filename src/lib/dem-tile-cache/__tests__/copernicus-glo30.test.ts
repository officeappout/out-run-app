import { describe, it, expect } from 'vitest';
import * as zlib from 'zlib';
import {
  copernicusTileName,
  copernicusTileUrl,
  copernicusTilesForBbox,
  sampleCopernicus,
  copernicusToElevationGrid,
  COPERNICUS_DEM_ATTRIBUTION,
  type CopernicusTile,
} from '../copernicus-glo30';
import { decodeFloat32GeoTiff } from '../geotiff-float32-decode.node';
import { assertStorable, mapboxTerrainDisplayProvider } from '../elevation-provider';

/** Builds a tiny tiled, DEFLATE + floating-point-predictor GeoTIFF like the GLO-30 COGs. */
function makeTiff(w: number, h: number, tile: number, value: (x: number, y: number) => number): Buffer {
  const across = Math.ceil(w / tile);
  const down = Math.ceil(h / tile);
  const blocks: Buffer[] = [];
  for (let by = 0; by < down; by++) for (let bx = 0; bx < across; bx++) {
    const raw = Buffer.alloc(tile * tile * 4);
    for (let r = 0; r < tile; r++) {
      const row = Buffer.alloc(tile * 4);
      for (let c = 0; c < tile; c++) {
        const f = Buffer.alloc(4);
        f.writeFloatBE(value(bx * tile + c, by * tile + r), 0);
        for (let p = 0; p < 4; p++) row[p * tile + c] = f[p];
      }
      for (let i = row.length - 1; i > 0; i--) row[i] = (row[i] - row[i - 1]) & 0xff;
      row.copy(raw, r * tile * 4);
    }
    blocks.push(zlib.deflateSync(raw));
  }
  const entries: Array<[number, number, number[] | Buffer]> = [];
  const dataStart = 8;
  const offsets: number[] = [];
  let p = dataStart;
  for (const b of blocks) { offsets.push(p); p += b.length; }
  const scale = Buffer.alloc(24); scale.writeDoubleLE(1 / 3600, 0); scale.writeDoubleLE(1 / 3600, 8);
  const tie = Buffer.alloc(48); tie.writeDoubleLE(34, 24); tie.writeDoubleLE(32, 32);
  entries.push([256, 3, [w]], [257, 3, [h]], [258, 3, [32]], [259, 3, [8]], [262, 3, [1]], [277, 3, [1]], [317, 3, [3]],
    [322, 3, [tile]], [323, 3, [tile]], [324, 4, offsets], [325, 4, blocks.map((b) => b.length)], [339, 3, [3]],
    [33550, 12, scale], [33922, 12, tie], [34735, 3, [1, 1, 0, 1, 1025, 0, 1, 2]]);
  const ifdOffset = p;
  const extra: Buffer[] = [];
  let extraOff = ifdOffset + 2 + entries.length * 12 + 4;
  const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
  ifd.writeUInt16LE(entries.length, 0);
  entries.forEach(([tag, type, val], i) => {
    const o = 2 + i * 12;
    ifd.writeUInt16LE(tag, o); ifd.writeUInt16LE(type, o + 2);
    let bytes: Buffer;
    if (Buffer.isBuffer(val)) bytes = val;
    else if (type === 3) { bytes = Buffer.alloc(val.length * 2); val.forEach((v, k) => bytes.writeUInt16LE(v, k * 2)); }
    else { bytes = Buffer.alloc(val.length * 4); val.forEach((v, k) => bytes.writeUInt32LE(v, k * 4)); }
    const count = Buffer.isBuffer(val) ? val.length / 8 : val.length;
    ifd.writeUInt32LE(count, o + 4);
    if (bytes.length <= 4) bytes.copy(ifd, o + 8);
    else { ifd.writeUInt32LE(extraOff, o + 8); extra.push(bytes); extraOff += bytes.length; }
  });
  const header = Buffer.alloc(8); header.write('II', 0, 'ascii'); header.writeUInt16LE(42, 2); header.writeUInt32LE(ifdOffset, 4);
  return Buffer.concat([header, ...blocks, ifd, ...extra]);
}

describe('decodeFloat32GeoTiff', () => {
  it('round-trips a tiled DEFLATE + predictor-3 float32 raster, incl. partial edge tiles', () => {
    const f = (x: number, y: number) => x * 1.5 - y * 0.25 + 100;
    const r = decodeFloat32GeoTiff(makeTiff(20, 13, 16, f));
    expect(r.width).toBe(20);
    expect(r.height).toBe(13);
    expect(r.values[0]).toBeCloseTo(100, 4);
    expect(r.values[12 * 20 + 19]).toBeCloseTo(f(19, 12), 4);
    expect(r.rasterType).toBe(2);
    expect(r.originLon).toBe(34);
    expect(r.originLat).toBe(32);
  });

  it('refuses non-TIFF input instead of returning a bogus grid', () => {
    expect(() => decodeFloat32GeoTiff(Buffer.from('not a tiff at all'))).toThrow();
  });
});

describe('copernicus-glo30 naming + sampling', () => {
  it('names and locates tiles by their south-west corner', () => {
    expect(copernicusTileName(31, 34)).toBe('Copernicus_DSM_COG_10_N31_00_E034_00_DEM');
    expect(copernicusTileUrl(31, 34)).toBe('https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N31_00_E034_00_DEM/Copernicus_DSM_COG_10_N31_00_E034_00_DEM.tif');
    expect(copernicusTilesForBbox({ latMin: 31.3, lonMin: 34.4, latMax: 31.6, lonMax: 34.7 })).toEqual([{ lat: 31, lon: 34 }]);
    expect(copernicusTilesForBbox({ latMin: 31.9, lonMin: 34.9, latMax: 32.1, lonMax: 35.1 })).toHaveLength(4);
  });

  const tile: CopernicusTile = {
    lat: 31, lon: 34, width: 3601, height: 3601, lon0: 34, lat0: 32, stepLon: 1 / 3600, stepLat: 1 / 3600,
    // elevation rises 1 m per sample eastward
    values: Float32Array.from({ length: 3601 * 3601 }, (_, i) => i % 3601),
  };
  const tiles = new Map([['31_34', tile]]);

  it('bilinear-interpolates between samples and returns null outside coverage', () => {
    expect(sampleCopernicus(tiles, 31.5, 34 + 10.5 / 3600)).toBeCloseTo(10.5, 3);
    expect(sampleCopernicus(tiles, 30.5, 34.5)).toBeNull();
  });

  it('resamples into the existing ElevationGrid (z/x/y) cache format', () => {
    const g = copernicusToElevationGrid(tiles, 14, 9757, 6693, 8);
    expect(g).not.toBeNull();
    expect(g!.values).toHaveLength(64);
    expect(g!.values[1]).toBeGreaterThan(g!.values[0]); // east is higher
  });
});

describe('elevation-provider licensing guard', () => {
  it('Mapbox terrain is display-only; storing from it throws', () => {
    expect(() => assertStorable(mapboxTerrainDisplayProvider(new Map()))).toThrow(/display-only/);
  });
  it('carries the Copernicus attribution text', () => {
    expect(COPERNICUS_DEM_ATTRIBUTION).toMatch(/Copernicus WorldDEM-30/);
    expect(COPERNICUS_DEM_ATTRIBUTION).toMatch(/DLR/);
    expect(COPERNICUS_DEM_ATTRIBUTION).toMatch(/Airbus/);
  });
});
