import { describe, it, expect } from 'vitest';
import { bboxToTileCoords, boundingBoxWithMargin, tileKey, lonToGlobalPixelX, latToGlobalPixelY, DEM_TILE_ZOOM } from '../tile-math';
import { sampleElevation, computeDemProfile, type ElevationGrid, type ElevationGridMap } from '../dem-sampling.service';

describe('tile-math', () => {
  it('bboxToTileCoords returns an inclusive rectangular tile range', () => {
    const bbox = { latMin: 32.05, lonMin: 34.77, latMax: 32.09, lonMax: 34.80 };
    const coords = bboxToTileCoords(bbox, 14);
    expect(coords.length).toBeGreaterThan(0);
    // Every coord must be at the requested zoom.
    expect(coords.every((c) => c.z === 14)).toBe(true);
    // Rectangular: (maxX-minX+1) * (maxY-minY+1) === coords.length
    const xs = coords.map((c) => c.x);
    const ys = coords.map((c) => c.y);
    const expected = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    expect(coords.length).toBe(expected);
  });

  it('boundingBoxWithMargin expands strictly beyond the raw point extents', () => {
    const points = [{ lat: 32.08, lng: 34.78 }, { lat: 32.09, lng: 34.79 }];
    const bbox = boundingBoxWithMargin(points, 300);
    expect(bbox.latMin).toBeLessThan(32.08);
    expect(bbox.latMax).toBeGreaterThan(32.09);
    expect(bbox.lonMin).toBeLessThan(34.78);
    expect(bbox.lonMax).toBeGreaterThan(34.79);
  });

  it('boundingBoxWithMargin throws on an empty point list rather than returning a bogus bbox', () => {
    expect(() => boundingBoxWithMargin([], 100)).toThrow();
  });

  it('tileKey is stable and distinguishes different tiles', () => {
    expect(tileKey(14, 10, 20)).toBe('14_10_20');
    expect(tileKey(14, 10, 20)).not.toBe(tileKey(14, 10, 21));
  });

  it('lonToGlobalPixelX/latToGlobalPixelY are monotonic (east/south increases pixel coords)', () => {
    expect(lonToGlobalPixelX(35, DEM_TILE_ZOOM)).toBeGreaterThan(lonToGlobalPixelX(34, DEM_TILE_ZOOM));
    // Web Mercator: higher latitude (further north) => SMALLER pixel Y.
    expect(latToGlobalPixelY(30, DEM_TILE_ZOOM)).toBeGreaterThan(latToGlobalPixelY(32, DEM_TILE_ZOOM));
  });
});

describe('dem-sampling.service', () => {
  // Build a single flat 4x4 tile (values all 100m) at z=14, tile (0,0), covering
  // a real-world location near the equator for simple, predictable pixel math.
  const FLAT_ELEVATION = 100;
  function makeFlatGrid(z: number, x: number, y: number, size: number): ElevationGrid {
    return { z, x, y, size, values: new Array(size * size).fill(FLAT_ELEVATION) };
  }

  // Real Tel Aviv coordinates, and the ACTUAL tile that covers them —
  // derived from the module's own pixel-math functions rather than
  // guessed, so this test can't drift out of sync with the real formulas.
  const TLV_LAT = 32.08;
  const TLV_LNG = 34.78;
  const tlvTileX = Math.floor(lonToGlobalPixelX(TLV_LNG, DEM_TILE_ZOOM) / 256);
  const tlvTileY = Math.floor(latToGlobalPixelY(TLV_LAT, DEM_TILE_ZOOM) / 256);

  it('sampleElevation returns the constant value across a flat, fully-covered tile', () => {
    const size = 256;
    // Bilinear interpolation reads up to a 2x2 tile neighborhood, so cover
    // all 4 tiles around the sample point to avoid an edge/gap false-negative.
    const tiles: ElevationGridMap = new Map();
    for (const dx of [0, 1]) {
      for (const dy of [0, 1]) {
        tiles.set(tileKey(DEM_TILE_ZOOM, tlvTileX + dx, tlvTileY + dy), makeFlatGrid(DEM_TILE_ZOOM, tlvTileX + dx, tlvTileY + dy, size));
      }
    }
    const elev = sampleElevation(tiles, TLV_LAT, TLV_LNG, DEM_TILE_ZOOM);
    expect(elev).toBeCloseTo(FLAT_ELEVATION, 1);
  });

  it('sampleElevation returns null when no tile covers the requested point', () => {
    const tiles: ElevationGridMap = new Map(); // empty cache
    expect(sampleElevation(tiles, 32.08, 34.78, DEM_TILE_ZOOM)).toBeNull();
  });

  it('computeDemProfile returns null (not a guess) when coverage is missing', () => {
    const tiles: ElevationGridMap = new Map();
    const path: Array<[number, number]> = [[32.08, 34.78], [32.081, 34.781]];
    expect(computeDemProfile(path, tiles, DEM_TILE_ZOOM)).toBeNull();
  });

  it('computeDemProfile returns zero gain/grade over a perfectly flat, fully-covered path', () => {
    const size = 256;
    const tiles: ElevationGridMap = new Map();
    for (const dx of [0, 1]) {
      for (const dy of [0, 1]) {
        tiles.set(tileKey(DEM_TILE_ZOOM, tlvTileX + dx, tlvTileY + dy), makeFlatGrid(DEM_TILE_ZOOM, tlvTileX + dx, tlvTileY + dy, size));
      }
    }
    const path: Array<[number, number]> = [[TLV_LAT, TLV_LNG], [TLV_LAT + 0.0005, TLV_LNG + 0.0005]];
    const result = computeDemProfile(path, tiles, DEM_TILE_ZOOM);
    expect(result).not.toBeNull();
    expect(result!.elevationGainM).toBe(0);
    expect(result!.maxGradePercent).toBe(0);
  });

  it('computeDemProfile is a no-op-safe on a single-point path (returns null, never throws)', () => {
    const tiles: ElevationGridMap = new Map();
    expect(computeDemProfile([[32.08, 34.78]], tiles, DEM_TILE_ZOOM)).toBeNull();
  });
});
