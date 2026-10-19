import { describe, it, expect } from 'vitest';
import { buildKmMarkers, kmMarkersFeatureCollection, pointAtMeters } from '../route-km-markers';
import { buildCumulativeMeters, type LngLat } from '@/features/parks/core/services/route-progress';

// Due north along a meridian: 1° lat ≈ 111 195 m, so 0.01° ≈ 1 112 m.
const north = (km: number): LngLat[] => {
  const pts: LngLat[] = [];
  const steps = Math.ceil(km * 10);
  for (let i = 0; i <= steps; i++) pts.push([34.8, 32 + (i / steps) * (km * 1000) / 111_195]);
  return pts;
};

describe('route km markers', () => {
  it('one badge per whole km inside the route', () => {
    const m = buildKmMarkers(north(5.2));
    expect(m.map((x) => x.km)).toEqual([1, 2, 3, 4, 5]);
    const cum = buildCumulativeMeters([[34.8, 32], m[1].point]);
    expect(cum[1]).toBeGreaterThan(1990);
    expect(cum[1]).toBeLessThan(2010);
  });

  it('drops a badge that would sit on the finish', () => {
    expect(buildKmMarkers(north(3.05)).map((x) => x.km)).toEqual([1, 2]);
  });

  it('nothing for routes ≤ 1 km or degenerate paths', () => {
    expect(buildKmMarkers(north(0.9))).toEqual([]);
    expect(buildKmMarkers([[34.8, 32]])).toEqual([]);
    expect(buildKmMarkers([])).toEqual([]);
  });

  it('thins long routes to every n-th km', () => {
    const m = buildKmMarkers(north(40.5), { maxMarkers: 10 });
    expect(m.length).toBeLessThanOrEqual(10);
    expect(m[0].km).toBe(4);
    expect(m.every((x) => x.km % 4 === 0)).toBe(true);
  });

  it('pointAtMeters interpolates and rejects out-of-range', () => {
    const path: LngLat[] = [[34.8, 32], [34.8, 32.01]];
    const cum = buildCumulativeMeters(path);
    const mid = pointAtMeters(path, cum, cum[1] / 2)!;
    expect(mid[1]).toBeCloseTo(32.005, 6);
    expect(pointAtMeters(path, cum, -1)).toBeNull();
    expect(pointAtMeters(path, cum, cum[1] + 1)).toBeNull();
  });

  it('feature collection carries the label', () => {
    const fc = kmMarkersFeatureCollection([{ km: 3, point: [34.8, 32] }]);
    expect(fc.features[0].properties).toEqual({ km: 3, label: '3' });
    expect(fc.features[0].geometry.coordinates).toEqual([34.8, 32]);
  });
});
