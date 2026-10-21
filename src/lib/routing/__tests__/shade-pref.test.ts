import { describe, expect, it } from 'vitest';
import { buildShadeIndex, type LonLat, type ShadeSegmentFeature } from '@/lib/shade';
import { rankLoopsByShade } from '../shade-pref';
import { parseGenerateRequest } from '../api-contract';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];
const seg = (a: LonLat, b: LonLat, shadeIndex: number): ShadeSegmentFeature => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] },
  properties: { shadeIndex, indexType: 'SI_daily', city: 'tel-aviv', sourceLayer: 't', sourceFeatureId: 1, fetchedAt: '' },
});
// Three parallel streets: y=0 sunny (0.05), y=100 shady (0.5), y=200 medium (0.25). Nothing at y=400.
const index = buildShadeIndex([seg(at(0, 0), at(300, 0), 0.05), seg(at(0, 100), at(300, 100), 0.5), seg(at(0, 200), at(300, 200), 0.25)]);
const loop = (y: number, pass = true) => ({ path: [at(0, y), at(300, y)] as [number, number][], verdict: { pass, reasons: [], penalty: 0 }, id: `y${y}` });

describe('rankLoopsByShade', () => {
  it('passing loops first, then measured shade high → low, unmeasured last', () => {
    const r = rankLoopsByShade([loop(0), loop(400), loop(200), loop(100, false), loop(100)], { city: 'tel-aviv', index }, 4);
    expect(r.loops.map((l) => l.id)).toEqual(['y100', 'y200', 'y0', 'y400']);
    expect(r.loops[0].shadeShare).toBeCloseTo(0.5, 2);
    expect(r.loops[3].shadeShare).toBeNull();
    expect(r.meta).toEqual({ requested: true, applied: true, city: 'tel-aviv', reason: 'applied' });
  });
  it('no shade data for the city → the generator order, top n, says why', () => {
    const r = rankLoopsByShade([loop(0), loop(100), loop(200), loop(400)], null, 3);
    expect(r.loops.map((l) => l.id)).toEqual(['y0', 'y100', 'y200']);
    expect(r.meta).toMatchObject({ applied: false, reason: 'no_shade_data', city: null });
    expect(rankLoopsByShade([loop(0)], null, 3, true).meta.reason).toBe('timeout');
  });
  it('a layer that measures none of the loops keeps the order (not_measured)', () => {
    const r = rankLoopsByShade([loop(400), loop(500)], { city: 'tel-aviv', index }, 3);
    expect(r.loops.map((l) => l.id)).toEqual(['y400', 'y500']);
    expect(r.meta).toMatchObject({ applied: false, reason: 'not_measured', city: 'tel-aviv' });
  });
});

describe('parseGenerateRequest — preferShade', () => {
  const base = { mode: 'loop', start: { lat: 32.08, lng: 34.78 }, targetKm: 5, activity: 'running' };
  it('carries preferShade + city only when preferShade is exactly true', () => {
    expect(parseGenerateRequest({ ...base, preferShade: true, city: ' תל אביב-יפו ' })).toMatchObject({ preferShade: true, city: 'תל אביב-יפו' });
    const off = parseGenerateRequest({ ...base, preferShade: 'yes', city: 'x' }) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(off, 'preferShade')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(off, 'city')).toBe(false);
  });
  it('drops an oversized city but keeps preferShade', () => {
    const r = parseGenerateRequest({ ...base, preferShade: true, city: 'x'.repeat(200) }) as Record<string, unknown>;
    expect(r.preferShade).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(r, 'city')).toBe(false);
  });
});
