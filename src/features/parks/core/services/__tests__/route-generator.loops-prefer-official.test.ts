/**
 * Loops prefer our routes (enable_loops_prefer_official) — generator wiring.
 * Off (unset / explicit false) must not load our routes and must call
 * Firestore + Mapbox exactly as before; on (with v1) must seed waypoints ON
 * our routes and keep the v1 pipeline otherwise intact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geohashForLocation } from 'geofire-common';

const U = { lat: 32.0779, lng: 34.774 };
const KM_LAT = 111.32, KM_LNG = 94.4;

// ── Firestore: a ring of residential segments around U (street_segments), one official corridor (official_routes).
const queries: Array<{ name: string; cons: Array<{ kind: string; v?: unknown }> }> = [];
const SEGMENTS = Array.from({ length: 24 }, (_, i) => {
  const brg = (i * 15 * Math.PI) / 180;
  const d = 0.35 + (i % 4) * 0.15;
  const lat = U.lat + (d / KM_LAT) * Math.cos(brg);
  const lng = U.lng + (d / KM_LNG) * Math.sin(brg);
  const path = [{ lat, lng: lng - 0.0006 }, { lat, lng: lng + 0.0006 }];
  return { id: `s${i}`, score: 8, cityName: 'תל אביב-יפו', path, midpoint: { lat, lng }, geohash: geohashForLocation([lat, lng], 10), tags: { highway: 'residential', lit: 'yes' } };
});
// East–west official route 500 m north of U, 2 km long.
const OFFICIAL_LAT = U.lat + 0.5 / KM_LAT;
const OFFICIAL_PATH = Array.from({ length: 21 }, (_, k) => ({ lat: OFFICIAL_LAT, lng: U.lng + (-1 + k * 0.1) / KM_LNG }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  query: (c: { name: string }, ...cons: Array<{ kind: string }>) => ({ name: c.name, cons }),
  orderBy: () => ({ kind: 'orderBy' }),
  startAt: (v: unknown) => ({ kind: 'startAt', v }),
  endAt: (v: unknown) => ({ kind: 'endAt', v }),
  limit: (v: number) => ({ kind: 'limit', v }),
  where: () => ({ kind: 'where' }),
  getDocs: async (q: { name: string; cons: Array<{ kind: string; v?: unknown }> }) => {
    queries.push(q);
    if (q.name === 'official_routes') {
      const docs = [{ id: 'off-1', data: () => ({ name: 'טיילת', published: true, path: OFFICIAL_PATH }) }];
      return { docs, size: 1, empty: false };
    }
    const start = q.cons.find(c => c.kind === 'startAt')?.v as string | undefined;
    const end = q.cons.find(c => c.kind === 'endAt')?.v as string | undefined;
    const docs = SEGMENTS.filter(s => !start || (s.geohash >= start && s.geohash <= (end ?? '~')))
      .map(({ id, ...d }) => ({ id, data: () => d }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  },
}));
const getCachedOfficialRoutes = vi.fn(async () => [] as unknown[]);
// The loop builder reads the set INCLUDING connector routes (RC10) — same spy for both names.
vi.mock('../inventory.service', () => ({
  getCachedOfficialRoutes: () => getCachedOfficialRoutes(),
  getCachedOfficialRoutesIncludingConnectors: () => getCachedOfficialRoutes(),
}));

const mapboxCalls: Array<{ waypoints: Array<{ lat: number; lng: number }>; extra: Record<string, string | undefined> | undefined }> = [];
function squareLoop(): [number, number][] {
  const s = 0.75 / KM_LAT, t = 0.75 / KM_LNG, pts: [number, number][] = [];
  const corners: [number, number][] = [[U.lng, U.lat], [U.lng + t, U.lat], [U.lng + t, U.lat + s], [U.lng, U.lat + s], [U.lng, U.lat]];
  for (let c = 1; c < corners.length; c++) for (let k = 0; k < 30; k++) {
    const f = k / 30; pts.push([corners[c - 1][0] + (corners[c][0] - corners[c - 1][0]) * f, corners[c - 1][1] + (corners[c][1] - corners[c - 1][1]) * f]);
  }
  pts.push([U.lng, U.lat]);
  return pts;
}
vi.mock('../mapbox.service', () => ({
  MapboxService: {
    getSmartPath: vi.fn(async (_s: unknown, _e: unknown, _p: unknown, waypoints: Array<{ lat: number; lng: number }>, extra?: Record<string, string>) => {
      mapboxCalls.push({ waypoints: waypoints.map(w => ({ lat: w.lat, lng: w.lng })), extra });
      return { path: squareLoop(), distance: 3000, duration: 2100, steps: [], legs: [] };
    }),
    getSmartPathAlternatives: vi.fn(async () => []),
  },
}));
vi.mock('../generator-elevation.service', () => ({ computeGeneratorDifficulty: async () => ({ difficulty: 'easy' }) }));
vi.mock('@/lib/route-quality/osm-layer-cache', () => ({ getOsmRoadLayerWithin: async () => null }));

import { generateDynamicRoutes } from '../route-generator.service';
import { clearOurRoutesCache } from '../loops-prefer-official';
import { clearQualityWaypointCache } from '../route-quality-v1/quality-waypoints';

const run = (routeQualityV1: boolean, loopsPreferOfficial?: boolean) => generateDynamicRoutes({
  userLocation: U, targetDistance: 3, activity: 'running', routeGenerationIndex: 1,
  preferences: { includeStrength: false, maxRoutes: 3, idealWaypointDistanceKm: 0.5 },
  parks: [], cityName: 'תל אביב-יפו', routeQualityV1, graphhopperRoutes: false,
  ...(loopsPreferOfficial === undefined ? {} : { loopsPreferOfficial }),
} as Parameters<typeof generateDynamicRoutes>[0]);

const onOfficial = (w: { lat: number }) => Math.abs(w.lat - OFFICIAL_LAT) < 1e-7;
const strip = (rs: Awaited<ReturnType<typeof run>>) => rs.map(r => ({ ...r, id: '', rating: 0 }));

beforeEach(() => {
  queries.length = 0; mapboxCalls.length = 0;
  getCachedOfficialRoutes.mockClear();
  clearOurRoutesCache(); clearQualityWaypointCache();
});

describe('enable_loops_prefer_official OFF (default)', () => {
  it('never loads our routes, with v1 on or off', async () => {
    await run(true);
    await run(false);
    await run(true, false);
    expect(getCachedOfficialRoutes).not.toHaveBeenCalled();
    expect(queries.some(q => q.name === 'official_routes')).toBe(false);
    expect(mapboxCalls.flatMap(c => c.waypoints).some(onOfficial)).toBe(false);
  });

  it('explicit false is byte-identical to the unset flag (v1 on)', async () => {
    const a = await run(true);
    const callsA = mapboxCalls.splice(0);
    const qa = queries.splice(0).map(q => q.name);
    clearQualityWaypointCache();
    const b = await run(true, false);
    expect(mapboxCalls).toEqual(callsA);
    expect(queries.map(q => q.name)).toEqual(qa);
    expect(strip(b)).toEqual(strip(a));
  });

  it('ON without v1 is still the legacy pipeline (our routes are a v1 / GraphHopper feature)', async () => {
    const a = await run(false);
    const callsA = mapboxCalls.splice(0);
    const b = await run(false, true);
    expect(getCachedOfficialRoutes).not.toHaveBeenCalled();
    expect(mapboxCalls).toEqual(callsA);
    expect(strip(b)).toEqual(strip(a));
  });
});

describe('enable_loops_prefer_official ON (with v1)', () => {
  it('reads our routes through the existing readers and seeds waypoints ON them', async () => {
    const routes = await run(true, true);
    expect(routes.length).toBeGreaterThan(0);
    expect(getCachedOfficialRoutes).toHaveBeenCalledTimes(1);
    expect(queries.filter(q => q.name === 'official_routes').length).toBeGreaterThan(0);
    expect(mapboxCalls.flatMap(c => c.waypoints).some(onOfficial)).toBe(true);
    // v1 pipeline intact: pinned params, honest attributes.
    expect(mapboxCalls[0].extra!.walkway_bias).toBe('1');
    for (const r of routes) expect(r.rating).toBe(0);
  });

  it('caches our routes: a regenerate at the same spot reads no route collection again', async () => {
    await run(true, true);
    const before = queries.filter(q => q.name === 'official_routes').length;
    await run(true, true);
    expect(queries.filter(q => q.name === 'official_routes').length).toBe(before);
  });
});
