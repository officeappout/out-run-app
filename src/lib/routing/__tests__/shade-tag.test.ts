import { describe, expect, it } from 'vitest';
import { buildShadeIndex, type LonLat, type ShadeSegmentFeature } from '@/lib/shade';
import { withShadedPct } from '../shade-tag';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];
const seg = (a: LonLat, b: LonLat, shadeIndex: number): ShadeSegmentFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [a, b] },
  properties: { shadeIndex, indexType: 'SI_daily', city: 'tel-aviv', sourceLayer: 'fixture', sourceFeatureId: 1, fetchedAt: '2026-10-22' },
});
// 0..100 m shaded (SI 0.4), 100..200 m not (SI 0.1).
const idx = buildShadeIndex([seg(at(0, 0), at(100, 0), 0.4), seg(at(100, 0), at(200, 0), 0.1)]);

describe('withShadedPct (enable_route_shade_tag)', () => {
  it('adds shadedPct only to measured loops; other loops are returned untouched', () => {
    const measured = { id: 'a', path: [at(0, 0), at(200, 0)] };
    const offLayer = { id: 'b', path: [at(0, 500), at(200, 500)] };
    const [a, b] = withShadedPct([measured, offLayer], idx);
    expect(Math.abs(a.shadedPct! - 50)).toBeLessThan(3);
    expect(b).toBe(offLayer);
    expect(Object.prototype.hasOwnProperty.call(b, 'shadedPct')).toBe(false);
  });
  it('no layer → the very same array (byte-identical response)', () => {
    const loops = [{ path: [at(0, 0), at(200, 0)] }];
    expect(withShadedPct(loops, null)).toBe(loops);
  });
});
