import { describe, expect, it } from 'vitest';
import { buildBoundaryIndex, ringCentre } from '../boundary';
import { pointInBoundary } from '@/lib/dataset-import/authority-assign';
import { CITY, at, square } from './geo-fixtures';

describe('buildBoundaryIndex', () => {
  it('returns null for a missing or ring-less geometry (no boundary ⇒ stop, never guess)', () => {
    expect(buildBoundaryIndex(null)).toBeNull();
    expect(buildBoundaryIndex({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(buildBoundaryIndex({ type: 'Polygon', coordinates: 'nope' })).toBeNull();
  });

  it('contains points inside, excludes outside and holes', () => {
    const b = buildBoundaryIndex({ type: 'Polygon', coordinates: [square(0, 0, 1000), square(400, 400, 200)] })!;
    expect(b.contains(at(100, 100))).toBe(true);
    expect(b.contains(at(500, 500))).toBe(false); // in the hole
    expect(b.contains(at(1500, 100))).toBe(false);
    expect(b.areaKm2).toBeCloseTo(0.96, 1);
  });

  it('handles MultiPolygons and agrees with the plain ray cast', () => {
    const g = { type: 'MultiPolygon' as const, coordinates: [[square(0, 0, 300)], [square(600, 600, 300)]] };
    const b = buildBoundaryIndex(g)!;
    for (let x = -50; x <= 1000; x += 37) {
      for (let y = -50; y <= 1000; y += 41) {
        expect(b.contains(at(x, y))).toBe(pointInBoundary(at(x, y), g as never));
      }
    }
  });

  it('exposes the bbox and the area of a simple square', () => {
    const b = buildBoundaryIndex(CITY)!;
    expect(b.areaKm2).toBeCloseTo(1, 1);
    expect(b.bbox.minLng).toBeCloseTo(at(0, 0)[0], 6);
  });

  it('ringCentre is the vertex mean', () => {
    const c = ringCentre([at(0, 0), at(100, 0), at(100, 100), at(0, 100)]);
    expect(c[0]).toBeCloseTo(at(50, 50)[0], 6);
    expect(c[1]).toBeCloseTo(at(50, 50)[1], 6);
  });
});
