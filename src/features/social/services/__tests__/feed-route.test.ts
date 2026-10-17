import { describe, expect, it } from 'vitest';
import { buildRouteShape, downsampleRoute, routeShapeToSvg, ROUTE_BOX, ROUTE_MAX_POINTS, trimRouteEnds, type LngLat } from '../feed-route';

// ~11.1 m per 0.0001° of latitude — a straight 2 km run north, a point every ~11 m.
const line = (n: number, lng = 34.78, lat0 = 32.08): LngLat[] => Array.from({ length: n }, (_, i) => [lng, lat0 + i * 0.0001]);

describe('trimRouteEnds', () => {
  it('cuts ~200 m at each end', () => {
    const path = line(181); // ~2 km
    const out = trimRouteEnds(path, 200);
    expect(out.length).toBeGreaterThan(100);
    // The first kept point is ≥ 200 m from the real start.
    expect((out[0][1] - path[0][1]) / 0.0001 * 11.1).toBeGreaterThanOrEqual(199);
    expect(((path[path.length - 1][1] - out[out.length - 1][1]) / 0.0001) * 11.1).toBeGreaterThanOrEqual(199);
  });
  it('a run too short to trim and still draw → nothing', () => {
    expect(trimRouteEnds(line(40), 200)).toEqual([]); // ~430 m
  });
});

describe('downsampleRoute', () => {
  it('keeps at most max points, first and last included', () => {
    const p = Array.from({ length: 500 }, (_, i) => i);
    const out = downsampleRoute(p, 64);
    expect(out).toHaveLength(64);
    expect(out[0]).toBe(0);
    expect(out[63]).toBe(499);
  });
});

describe('buildRouteShape', () => {
  it('no GPS / junk → null', () => {
    expect(buildRouteShape(undefined)).toBeNull();
    expect(buildRouteShape([])).toBeNull();
    expect(buildRouteShape([[0, 0], [NaN, 1], 'x'])).toBeNull();
  });
  it('a real run → a flat integer list in the box, no coordinates', () => {
    const square: LngLat[] = [
      ...line(90, 34.78, 32.08),
      ...Array.from({ length: 90 }, (_, i): LngLat => [34.78 + i * 0.0001, 32.08 + 89 * 0.0001]),
    ];
    const shape = buildRouteShape(square)!;
    expect(shape).not.toBeNull();
    expect(shape.length % 2).toBe(0);
    expect(shape.length / 2).toBeLessThanOrEqual(ROUTE_MAX_POINTS);
    expect(shape.every((n) => Number.isInteger(n) && n >= 0 && n <= ROUTE_BOX)).toBe(true);
    expect(Math.max(...shape)).toBe(ROUTE_BOX);
    // Nothing that looks like a lat/lng survives.
    expect(shape.some((n) => Math.abs(n - 32) < 1 || Math.abs(n - 34) < 1)).toBe(false);
  });
});

describe('routeShapeToSvg', () => {
  it('bad shapes → null', () => {
    expect(routeShapeToSvg(undefined, 320, 150)).toBeNull();
    expect(routeShapeToSvg([1, 2, 3], 320, 150)).toBeNull();
    expect(routeShapeToSvg([5, 5, 5, 5, 5, 5], 320, 150)).toBeNull();
  });
  it('fits inside the viewBox with padding', () => {
    const svg = routeShapeToSvg([0, 0, 1000, 0, 1000, 500], 320, 150, 16)!;
    expect(svg.d.startsWith('M')).toBe(true);
    const nums = svg.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(16 - 0.01);
      expect(nums[i]).toBeLessThanOrEqual(320 - 16 + 0.01);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
      expect(nums[i + 1]).toBeLessThanOrEqual(150);
    }
    expect(svg.start).toEqual([nums[0], nums[1]]);
  });
});
