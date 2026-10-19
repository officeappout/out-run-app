/**
 * enable_graphhopper_routes — generator wiring. Flag off: the GraphHopper
 * endpoint is never called and Mapbox runs exactly as before. Flag on: loops
 * come from /api/routes/generate; any failure falls back to Mapbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const U = { lat: 32.0779, lng: 34.774 };
const mapboxCalls: unknown[] = [];

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'tok' } } }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), query: () => ({}), orderBy: () => ({}), startAt: () => ({}), endAt: () => ({}), limit: () => ({}), where: () => ({}),
  getDocs: async () => ({ docs: [], size: 0, empty: true }),
}));
function squareLoop(): [number, number][] {
  const s = 0.75 / 111.32, t = 0.75 / 94.4, pts: [number, number][] = [];
  const c: [number, number][] = [[U.lng, U.lat], [U.lng + t, U.lat], [U.lng + t, U.lat + s], [U.lng, U.lat + s], [U.lng, U.lat]];
  for (let i = 1; i < c.length; i++) for (let k = 0; k < 30; k++) { const f = k / 30; pts.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f]); }
  pts.push([U.lng, U.lat]);
  return pts;
}
vi.mock('../mapbox.service', () => ({
  MapboxService: {
    getSmartPath: vi.fn(async () => { mapboxCalls.push(1); return { path: squareLoop(), distance: 3000, duration: 2100, steps: [], legs: [] }; }),
    getSmartPathAlternatives: vi.fn(async () => []),
  },
}));
vi.mock('../generator-elevation.service', () => ({ computeGeneratorDifficulty: async () => ({ difficulty: 'easy' }) }));
vi.mock('@/lib/route-quality/osm-layer-cache', () => ({ getOsmRoadLayerWithin: async () => null }));

import { generateDynamicRoutes } from '../route-generator.service';

const ghLoop = { source: 'round_trip', path: squareLoop(), distanceKm: 3.02, timeMin: 40, ascendM: 5, maxGradePct: 1, pass: true, reasons: [], score: 0.2, majorRoadPct: 0, unmarkedCrossingsPerKm: null, retracedPct: 0, compactness: 0.78 };
const fetchMock = vi.fn();

const run = (graphhopperRoutes?: boolean) => generateDynamicRoutes({
  userLocation: U, targetDistance: 3, activity: 'running', routeGenerationIndex: 1,
  preferences: { includeStrength: false, maxRoutes: 3 }, parks: [], cityName: undefined,
  ...(graphhopperRoutes === undefined ? {} : { graphhopperRoutes }),
} as Parameters<typeof generateDynamicRoutes>[0]);

beforeEach(() => { mapboxCalls.length = 0; fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('route generator — enable_graphhopper_routes', () => {
  it('flag off (unset → live flag default false): never calls the endpoint, Mapbox pipeline runs', async () => {
    const routes = await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mapboxCalls.length).toBeGreaterThan(0);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0].id.startsWith('gen-')).toBe(true);
  });
  it('explicit false = unset', async () => {
    await run(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('flag on: GraphHopper loops, no Mapbox calls', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ backend: 'graphhopper', loops: [ghLoop], calls: 9, timedOut: false, osmLayer: true }), { status: 200 }));
    const routes = await run(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mapboxCalls).toHaveLength(0);
    expect(routes).toHaveLength(1);
    expect(routes[0].id.startsWith('gh-')).toBe(true);
  });
  it('flag on + endpoint failure: falls back to the Mapbox pipeline', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"graphhopper_failed"}', { status: 502 }));
    const routes = await run(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mapboxCalls.length).toBeGreaterThan(0);
    expect(routes[0].id.startsWith('gen-')).toBe(true);
  });
});
