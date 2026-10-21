import { describe, expect, it } from 'vitest';
import {
  buildShadeIndex,
  haversineM,
  normalizeLayer,
  principalAxis,
  shadeShareForLine,
  type LonLat,
  type RawFeatureCollection,
  type ShadeSegmentFeature,
} from '..';

// Petah Tikva-ish origin. ~94.4 m per 0.001° lon, ~111.2 m per 0.001° lat.
const LON0 = 34.88;
const LAT0 = 32.09;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const M_LAT = 1 / 111_195;
const at = (xM: number, yM: number): LonLat => [LON0 + xM * M_LON, LAT0 + yM * M_LAT];

/** Axis-aligned rectangle polygon (closed ring) in metres from origin. */
function rect(x0: number, y0: number, x1: number, y1: number): LonLat[] {
  return [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
}

function seg(coords: LonLat[], shadeIndex: number, widthM = 0): ShadeSegmentFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      shadeIndex,
      indexType: 'SI_daily',
      city: 'test',
      sourceLayer: 'fixture',
      sourceFeatureId: 1,
      fetchedAt: '2026-10-21T00:00:00Z',
      widthM,
    },
  };
}

const ctx = {
  city: 'test',
  sourceLayer: 'https://example/FeatureServer/0',
  fetchedAt: '2026-10-21T00:00:00Z',
  mapping: { shadeField: 'summer_SI', indexType: 'SI_daily' as const, idField: 'FID', tccField: 'TCC' },
};

describe('principalAxis', () => {
  it('reduces a 100 x 20 m east-west street polygon to its centreline', () => {
    const axis = principalAxis(rect(0, -10, 100, 10))!;
    expect(axis).not.toBeNull();
    expect(axis.lengthM).toBeCloseTo(100, 0);
    expect(axis.widthM).toBeCloseTo(20, 0);
    const [a, b] = [...axis.line].sort((p, q) => p[0] - q[0]);
    expect(haversineM(a, at(0, 0))).toBeLessThan(0.5);
    expect(haversineM(b, at(100, 0))).toBeLessThan(0.5);
  });

  it('follows a diagonal street', () => {
    const ring: LonLat[] = [at(0, 5), at(5, 0), at(105, 100), at(100, 105), at(0, 5)];
    const axis = principalAxis(ring)!;
    expect(axis.lengthM).toBeGreaterThan(140);
    expect(axis.widthM).toBeLessThan(10);
  });
});

describe('normalizeLayer', () => {
  it('maps fields, keeps ids, and skips empty geometry / bad index', () => {
    const fc: RawFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 1, geometry: { type: 'Polygon', coordinates: [rect(0, -10, 100, 10)] }, properties: { FID: 1, summer_SI: 0.42, TCC: 0.3 } },
        { type: 'Feature', id: 2, geometry: { type: 'Polygon', coordinates: [[]] }, properties: { FID: 2, summer_SI: 0.5 } },
        { type: 'Feature', id: 3, geometry: null, properties: { FID: 3, summer_SI: 0.5 } },
        { type: 'Feature', id: 4, geometry: { type: 'Polygon', coordinates: [rect(0, 20, 50, 30)] }, properties: { FID: 4, summer_SI: null } },
        { type: 'Feature', id: 5, geometry: { type: 'Polygon', coordinates: [rect(0, 20, 50, 30)] }, properties: { FID: 5, summer_SI: 1.7 } },
        { type: 'Feature', id: 6, geometry: { type: 'MultiPolygon', coordinates: [[rect(0, 40, 60, 50)]] }, properties: { FID: 6, summer_SI: 0 } },
      ],
    };
    const { collection, stats } = normalizeLayer(fc, ctx);
    expect(stats).toEqual({ input: 6, output: 2, skippedNoGeometry: 2, skippedBadIndex: 2 });
    const [first, second] = collection.features;
    expect(first.geometry.type).toBe('LineString');
    expect(first.geometry.coordinates).toHaveLength(2);
    expect(first.properties).toMatchObject({
      shadeIndex: 0.42,
      indexType: 'SI_daily',
      city: 'test',
      sourceLayer: ctx.sourceLayer,
      sourceFeatureId: 1,
      fetchedAt: ctx.fetchedAt,
      tcc: 0.3,
    });
    expect(first.properties.widthM).toBeCloseTo(20, 0);
    expect(Object.prototype.hasOwnProperty.call(first.properties, 'siNoTrees')).toBe(false);
    expect(second.properties.shadeIndex).toBe(0);
    expect(second.properties.sourceFeatureId).toBe(6);
  });
});

describe('shadeShareForLine', () => {
  // Main street along y=0 (SI 0.8), a side street along x=50 (SI 0.1).
  const main = seg([at(0, 0), at(200, 0)], 0.8);
  const side = seg([at(50, -100), at(50, 100)], 0.1);
  const segments = [main, side];

  it('returns the segment index for a route along it (on the sidewalk, 8 m off-axis)', () => {
    const r = shadeShareForLine([at(10, 8), at(190, 8)], segments);
    expect(r.shadeShare).toBeCloseTo(0.8, 5);
    expect(r.coverage).toBeCloseTo(1, 5);
    expect(r.totalLengthM).toBeCloseTo(180, 0);
  });

  it('does not credit a crossing side street to a route running along the main street', () => {
    const r = shadeShareForLine([at(0, 2), at(100, 2)], segments);
    expect(r.shadeShare).toBeCloseTo(0.8, 5);
  });

  it('length-weights across two streets', () => {
    // 100 m along the side street (0.1) then 100 m along the main street (0.8).
    const r = shadeShareForLine([at(50, 100), at(50, 0), at(150, 0)], segments, { bufferM: 15 });
    expect(r.shadeShare!).toBeGreaterThan(0.4);
    expect(r.shadeShare!).toBeLessThan(0.5);
    expect(r.coverage).toBeCloseTo(1, 5);
  });

  it('reports partial coverage and ignores unmatched length in the mean', () => {
    // 100 m on the main street, then 100 m north into nothing at x=150.
    const r = shadeShareForLine([at(100, 0), at(150, 0), at(150, 50)], segments);
    expect(r.shadeShare).toBeCloseTo(0.8, 5);
    expect(r.coverage).toBeGreaterThan(0.45);
    expect(r.coverage).toBeLessThan(0.65);
  });

  it('respects the 15 m buffer', () => {
    expect(shadeShareForLine([at(10, 14), at(190, 14)], [main]).coverage).toBeCloseTo(1, 5);
    const far = shadeShareForLine([at(10, 16), at(190, 16)], [main]);
    expect(far.shadeShare).toBeNull();
    expect(far.coverage).toBe(0);
  });

  it('widens the buffer by half the street polygon width (capped)', () => {
    const wide = seg([at(0, 0), at(200, 0)], 0.5, 40); // 40 m boulevard
    expect(shadeShareForLine([at(10, 28), at(190, 28)], [wide]).coverage).toBeCloseTo(1, 5);
    expect(shadeShareForLine([at(10, 28), at(190, 28)], [wide], { widenByWidth: false }).coverage).toBe(0);
    // cap: half-width 20 is capped at 15 → 15 + 15 = 30 m reach
    expect(shadeShareForLine([at(10, 33), at(190, 33)], [wide]).coverage).toBe(0);
  });

  it('accepts a prebuilt index and handles empty input', () => {
    const idx = buildShadeIndex(segments);
    expect(shadeShareForLine([at(10, 0), at(40, 0)], idx).shadeShare).toBeCloseTo(0.8, 5);
    expect(shadeShareForLine([], idx)).toEqual({ shadeShare: null, coverage: 0, matchedLengthM: 0, totalLengthM: 0 });
    expect(shadeShareForLine([at(0, 0), at(10, 0)], []).shadeShare).toBeNull();
  });
});
