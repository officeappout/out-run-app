import { describe, it, expect } from 'vitest';
import type { Route } from '../../types/route.types';
import { deriveRouteTags, fountainPoints } from '../route-tags';

type R = Pick<Route, 'path' | 'qualitySignals' | 'shadeInfo'>;
const path: [number, number][] = [[34.78, 32.08], [34.781, 32.081], [34.782, 32.082]];
const bare: R = { path };
const qs = (q: unknown) => ({ path, qualitySignals: q } as unknown as R);
const keys = (r: R, ctx = {}) => deriveRouteTags(r, ctx).map((t) => t.key);

describe('deriveRouteTags', () => {
  it('no data → no tags (nothing invented)', () => {
    expect(deriveRouteTags(bare)).toEqual([]);
  });

  it('via a fitness park → מתקן כושר', () => {
    expect(keys(bare, { viaFitnessPark: true })).toEqual(['fitness']);
  });

  it('lighting only when computed and lit', () => {
    expect(keys(qs({ lighting: { status: 'computed', isLit: true } }))).toEqual(['lit']);
    expect(keys(qs({ lighting: { status: 'computed', isLit: false } }))).toEqual([]);
    expect(keys(qs({ lighting: { status: 'unknown' } }))).toEqual([]);
  });

  it('water from computed amenities or a fountain within 25 m of the path', () => {
    expect(keys(qs({ amenities: { status: 'computed', has: { drinking_water: true } } }))).toEqual(['water']);
    expect(keys(bare, { fountains: [{ lat: 32.0811, lng: 34.7811 }] })).toEqual(['water']);
    expect(keys(bare, { fountains: [{ lat: 32.09, lng: 34.79 }] })).toEqual([]);
    expect(keys(qs({ amenities: { status: 'no_coverage', has: { drinking_water: true } } }))).toEqual([]);
  });

  it('dedicated-path % only at or above the moderate cut', () => {
    expect(deriveRouteTags(qs({ composition: { genuinePct: 72.4 } }))).toEqual([{ key: 'composition', pct: 72 }]);
    expect(deriveRouteTags(qs({ composition: { genuinePct: 40 } }))).toEqual([]);
  });

  it('shade % only when measured and > 0', () => {
    expect(deriveRouteTags({ path, shadeInfo: { shadedPct: 55.6 } })).toEqual([{ key: 'shade', pct: 56 }]);
    expect(deriveRouteTags({ path, shadeInfo: { shadedPct: 0 } })).toEqual([]);
    expect(deriveRouteTags({ path, shadeInfo: { shadedPct: null } })).toEqual([]);
  });

  it('fixed order, capped at 3', () => {
    const all = { path, shadeInfo: { shadedPct: 50 }, qualitySignals: {
      lighting: { status: 'computed', isLit: true },
      amenities: { status: 'computed', has: { drinking_water: true, fitness_station: true } },
      composition: { genuinePct: 90 },
    } } as unknown as R;
    expect(keys(all)).toEqual(['fitness', 'lit', 'water']);
    expect(deriveRouteTags(all, {}, 10).map((t) => t.key)).toEqual(['fitness', 'lit', 'water', 'composition', 'shade']);
  });
});

describe('fountainPoints', () => {
  it('only parks whose record says they have water', () => {
    expect(fountainPoints([
      { location: { lat: 32.1, lng: 34.8 }, amenities: { hasWater: true } },
      { location: { lat: 32.2, lng: 34.8 }, amenities: { hasWater: false } },
      { location: { lat: 32.3, lng: 34.8 } },
      { location: null, amenities: { hasWater: true } },
    ])).toEqual([{ lat: 32.1, lng: 34.8 }]);
  });
});
