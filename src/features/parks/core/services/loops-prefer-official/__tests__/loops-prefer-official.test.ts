import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OurRouteLine } from '@/lib/route-quality';

vi.mock('../../inventory.service', () => ({ getCachedOfficialRoutes: async () => [] }));

import { seedsFromOurRoutes, withOurRouteSeeds, MAX_SEEDS } from '../route-seeds';
import { ourRoutesRankFactor, OUR_ROUTES_RANK_WEIGHT } from '../ranking';
import { clearOurRoutesCache, loadOurRoutesNear, prepareOurRoutes, toOurRouteLines } from '../our-routes-source';
import { ourRoutesSources } from '../sources';
import { resolveLoopsPreferOfficial } from '../flag';

const U = { lat: 32.0779, lng: 34.774 };
const KM_LAT = 111.32, KM_LNG = 94.4;
const ew = (id: string, northKm: number, fromKm = -1, toKm = 1): OurRouteLine => ({
  id, path: Array.from({ length: 21 }, (_, k) => [U.lng + (fromKm + ((toKm - fromKm) * k) / 20) / KM_LNG, U.lat + northKm / KM_LAT] as [number, number]),
});

describe('seedsFromOurRoutes', () => {
  it('samples points ON the route, with its bearing, only inside the waypoint ring', () => {
    const seeds = seedsFromOurRoutes([ew('a', 0.5)], U, 0.5);
    expect(seeds.length).toBeGreaterThan(5);
    for (const s of seeds) {
      expect(s.lat).toBeCloseTo(U.lat + 0.5 / KM_LAT, 7);
      expect([90, 270]).toContain(Math.round(s.bearingDeg));
      expect(s).toMatchObject({ snapped: true, isOfficial: true, segQuality: 10 });
      const dKm = Math.hypot((s.lat - U.lat) * KM_LAT, (s.lng - U.lng) * KM_LNG);
      expect(dKm).toBeGreaterThanOrEqual(0.45 * 0.5 - 0.01);
      expect(dKm).toBeLessThanOrEqual(1.9 * 0.5 + 0.01);
    }
  });

  it('ignores routes outside the ring and caps the seed count', () => {
    expect(seedsFromOurRoutes([ew('far', 5)], U, 0.5)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ew(`r${i}`, 0.3 + i * 0.02));
    expect(seedsFromOurRoutes(many, U, 0.5).length).toBe(MAX_SEEDS);
  });

  it('withOurRouteSeeds keeps the quiet candidates first and returns them untouched with no routes', () => {
    const quiet = [{ lat: 1, lng: 2, bearingDeg: 0, snapped: true as const, isOfficial: false, flowScore: 0, segQuality: 5 }];
    expect(withOurRouteSeeds(quiet, [], U, 0.5)).toBe(quiet);
    const mixed = withOurRouteSeeds(quiet, [ew('a', 0.5)], U, 0.5);
    expect(mixed[0]).toBe(quiet[0]);
    expect(mixed.length).toBeGreaterThan(1);
  });
});

describe('ourRoutesRankFactor', () => {
  it('is 1 at share 0, 1 − weight at share 1, clamped', () => {
    expect(ourRoutesRankFactor(0)).toBe(1);
    expect(ourRoutesRankFactor(1)).toBeCloseTo(1 - OUR_ROUTES_RANK_WEIGHT);
    expect(ourRoutesRankFactor(2)).toBeCloseTo(1 - OUR_ROUTES_RANK_WEIGHT);
    expect(ourRoutesRankFactor(Number.NaN)).toBe(1);
  });
});

describe('our routes source', () => {
  beforeEach(() => clearOurRoutesCache());

  it('merges sources by id, filters to the radius, caches non-empty reads', async () => {
    const a = vi.fn(async () => [ew('x', 0.5), ew('far', 9)]);
    const b = vi.fn(async () => [ew('x', 0.5), ew('y', -0.4)]);
    const lines = await loadOurRoutesNear(U, 2, { a, b });
    expect(lines.map(l => l.id).sort()).toEqual(['x', 'y']);
    await loadOurRoutesNear(U, 2, { a, b });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a failing source contributes nothing', async () => {
    const lines = await loadOurRoutesNear(U, 2, { bad: async () => { throw new Error('x'); }, ok: async () => [ew('x', 0.5)] });
    expect(lines.map(l => l.id)).toEqual(['x']);
  });

  it('prepareOurRoutes gives up after the wait', async () => {
    vi.useFakeTimers();
    const p = prepareOurRoutes(U, 2, { slow: () => new Promise(() => {}) }, 50);
    await vi.advanceTimersByTimeAsync(60);
    expect(await p).toEqual({ lines: [], index: null });
    vi.useRealTimers();
  });

  it('prepareOurRoutes builds a scoring index', async () => {
    const ctx = await prepareOurRoutes(U, 2, { a: async () => [ew('x', 0.5)] });
    expect(ctx.lines).toHaveLength(1);
    expect(ctx.index?.routeCount).toBe(1);
  });

  it('toOurRouteLines drops docs without a usable path', () => {
    const lines = toOurRouteLines([{ id: 'a', path: [[1, 2], [3, 4]] }, { id: 'b', path: [[1, 2]] }, { id: 'c' }, { id: 'd', path: [[1, Number.NaN], [1, 2]] }], 'official');
    expect(lines.map(l => l.id)).toEqual(['a']);
  });

  it('sources: map set always, city corridors only with a city', async () => {
    expect(Object.keys(ourRoutesSources(undefined, async () => []))).toEqual(['official:map']);
    const reader = vi.fn(async () => [{ id: 'c1', path: [[34.77, 32.07], [34.78, 32.07]] as [number, number][] }]);
    const s = ourRoutesSources(' חיפה ', reader);
    expect(Object.keys(s)).toEqual(['official:map', 'official:city:חיפה']);
    expect((await s['official:city:חיפה']()).map(l => l.id)).toEqual(['c1']);
    expect(reader).toHaveBeenCalledWith('חיפה');
  });
});

describe('resolveLoopsPreferOfficial', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('explicit boolean wins; default (no device cache) is OFF', () => {
    expect(resolveLoopsPreferOfficial(true)).toBe(true);
    expect(resolveLoopsPreferOfficial(false)).toBe(false);
    expect(resolveLoopsPreferOfficial(undefined)).toBe(false);
  });
});
