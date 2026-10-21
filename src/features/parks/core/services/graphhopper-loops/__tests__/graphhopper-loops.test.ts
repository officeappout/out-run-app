/**
 * enable_graphhopper_routes — the app-side adapter: eligibility, DTO → Route,
 * and the fallback contract (any error / timeout / empty → null).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

import { isGraphhopperLoopRequest, loopDtoToRoute, tryGraphhopperLoops, type GhLoopOptions } from '..';
import type { GeneratedLoopDto } from '@/lib/routing/api-contract';

const U = { lat: 32.0779, lng: 34.774 };
const opts = (o: Partial<GhLoopOptions> = {}): GhLoopOptions => ({
  userLocation: U, targetDistance: 5, activity: 'running', routeGenerationIndex: 42, preferences: { includeStrength: false, maxRoutes: 3 }, ...o,
});
const square: [number, number][] = [[34.774, 32.0779], [34.79, 32.0779], [34.79, 32.09], [34.774, 32.09], [34.774, 32.0779]];
const dto = (o: Partial<GeneratedLoopDto> = {}): GeneratedLoopDto => ({
  source: 'round_trip', path: square, distanceKm: 4.93, timeMin: 60, ascendM: 12, maxGradePct: 3.1, pass: true, reasons: [], score: 0.3,
  majorRoadPct: 0.05, unmarkedCrossingsPerKm: null, retracedPct: 0, compactness: 0.7, ...o,
});
const okFetch = (loops: GeneratedLoopDto[]) => vi.fn(async () => new Response(JSON.stringify({ backend: 'graphhopper', loops, calls: 9, timedOut: false, osmLayer: false }), { status: 200 }));
const deps = (fetchImpl: unknown, extra: object = {}) => ({ getToken: async () => 'tok', fetchImpl: fetchImpl as typeof fetch, ...extra });

describe('eligibility — plain loops only', () => {
  it.each([
    ['plain loop', {}, true],
    ['commute', { destination: U }, false],
    ['corridor follow', { followOfficialRouteId: 'r1' }, false],
    ['chain', { discoverCorridorChain: true }, false],
    ['user-anchored flow', { userAnchoredCorridorFlow: true }, false],
    ['deviation recovery', { activeOfficialRouteId: 'r1' }, false],
    ['fitness stop', { preferences: { includeStrength: true } }, false],
    ['short-route mode < 1.5 km', { shortRouteMode: true, targetDistance: 1 }, false],
    ['short-route mode ≥ 1.5 km', { shortRouteMode: true, targetDistance: 3 }, true],
    ['workout activity', { activity: 'workout' as const }, false],
    ['cycling', { activity: 'cycling' as const }, true],
  ])('%s', (_n, o, want) => expect(isGraphhopperLoopRequest(opts(o as Partial<GhLoopOptions>))).toBe(want));
});

describe('tryGraphhopperLoops', () => {
  it('posts the loop request with the Firebase token and maps loops to Routes', async () => {
    const f = okFetch([dto(), dto({ source: 'via_loop', pass: false, reasons: ['compactness'], score: 10.6, majorRoadPct: 0.4 })]);
    const routes = await tryGraphhopperLoops(opts({ targetDistance: 1 }), deps(f));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/routes/generate');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'loop', start: U, targetKm: 1.5, activity: 'running', seed: 42, maxResults: 3 });
    expect(routes).toHaveLength(2);
    expect(routes![0]).toMatchObject({ distance: 4.9, duration: 30, rating: 0, path: square, routeShape: 'loop', elevationGain: 12, maxGrade: 3.1, difficulty: 'easy' });
    expect(routes![0].features).toMatchObject({ hasBenches: false, lit: undefined, trafficLoad: 'low' });
    expect(routes![1].features.trafficLoad).toBe('high');
  });
  it('sends our routes (enable_loops_prefer_official) only when there are some', async () => {
    const f = okFetch([dto()]);
    const wire = [{ id: 'r1', path: [[34.775, 32.08], [34.78, 32.08]] as [number, number][] }];
    await tryGraphhopperLoops(opts(), deps(f), wire);
    await tryGraphhopperLoops(opts(), deps(f), []);
    const bodies = (f.mock.calls as unknown as Array<[string, RequestInit]>).map(c => JSON.parse(c[1].body as string));
    expect(bodies[0].ourRoutes).toEqual(wire);
    expect('ourRoutes' in bodies[1]).toBe(false);
  });
  it.each([
    ['HTTP 503', vi.fn(async () => new Response('{}', { status: 503 }))],
    ['HTTP 429', vi.fn(async () => new Response('{}', { status: 429 }))],
    ['network error', vi.fn(async () => { throw new TypeError('Failed to fetch'); })],
    ['empty answer', okFetch([])],
    ['malformed answer', vi.fn(async () => new Response('{"loops":"x"}', { status: 200 }))],
  ])('%s → null (Mapbox fallback)', async (_n, f) => {
    expect(await tryGraphhopperLoops(opts(), deps(f))).toBeNull();
  });
  it('> 2 s → null', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason))));
    const t0 = Date.now();
    expect(await tryGraphhopperLoops(opts(), deps(hang, { timeoutMs: 40 }))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('not signed in → null without a request', async () => {
    const f = okFetch([dto()]);
    expect(await tryGraphhopperLoops(opts(), { fetchImpl: f as unknown as typeof fetch })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('ineligible request → null without a request', async () => {
    const f = okFetch([dto()]);
    expect(await tryGraphhopperLoops(opts({ destination: U }), deps(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('walking/cycling duration comes from GraphHopper time', () => {
    expect(loopDtoToRoute(dto({ timeMin: 61.4 }), 0, 'walking', 1).duration).toBe(61);
    expect(loopDtoToRoute(dto({ ascendM: 400, distanceKm: 5 }), 0, 'cycling', 1).difficulty).toBe('hard');
  });
});

describe('timeAware (enable_route_time_aware)', () => {
  const bodyOf = async (o: Partial<GhLoopOptions>) => {
    const f = okFetch([dto()]);
    await tryGraphhopperLoops(opts(o), deps(f));
    return JSON.parse((f.mock.calls as unknown as Array<[string, RequestInit]>)[0][1].body as string);
  };
  it('on: the request carries timeAware + the city', async () => {
    expect(await bodyOf({ timeAware: true, cityName: 'תל אביב-יפו' })).toMatchObject({ timeAware: true, city: 'תל אביב-יפו' });
  });
  it('off (live flag default false): no timeAware / city keys at all', async () => {
    const b = await bodyOf({ cityName: 'תל אביב-יפו' });
    expect(Object.prototype.hasOwnProperty.call(b, 'timeAware')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(b, 'city')).toBe(false);
  });
  it('"shadiest route" picked: preferShade only, never timeAware', async () => {
    const b = await bodyOf({ timeAware: true, cityName: 'תל אביב-יפו', preferences: { includeStrength: false, maxRoutes: 3, preferShade: true } });
    expect(b.preferShade).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(b, 'timeAware')).toBe(false);
  });
});

