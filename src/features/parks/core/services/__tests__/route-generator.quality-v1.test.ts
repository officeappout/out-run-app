/**
 * Route quality v1 (enable_route_quality_v1) — generator wiring.
 * Flag off (live flag unset / explicit false) must call Firestore and Mapbox
 * exactly as before and return the legacy attributes; flag on must use the
 * ring-sampled reads, pinned Mapbox params and honest attributes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geohashForLocation } from 'geofire-common';

const U = { lat: 32.0779, lng: 34.774 };

// ── Firestore: a ring of residential segments around U; every query sees them all.
const queries: Array<{ cons: Array<{ kind: string; v?: unknown }> }> = [];
const SEGMENTS = Array.from({ length: 24 }, (_, i) => {
  const brg = (i * 15 * Math.PI) / 180;
  const d = 0.35 + (i % 4) * 0.15; // km
  const lat = U.lat + (d / 111.32) * Math.cos(brg);
  const lng = U.lng + (d / 94.4) * Math.sin(brg);
  const path = [{ lat, lng: lng - 0.0006 }, { lat, lng: lng + 0.0006 }];
  return { id: `s${i}`, score: 8, cityName: 'תל אביב-יפו', path, midpoint: { lat, lng }, geohash: geohashForLocation([lat, lng], 10), tags: { highway: 'residential', lit: 'yes' } };
});
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({ cons: [] }),
  query: (_c: unknown, ...cons: Array<{ kind: string }>) => ({ cons }),
  orderBy: () => ({ kind: 'orderBy' }),
  startAt: (v: unknown) => ({ kind: 'startAt', v }),
  endAt: (v: unknown) => ({ kind: 'endAt', v }),
  limit: (v: number) => ({ kind: 'limit', v }),
  where: () => ({ kind: 'where' }),
  getDocs: async (q: { cons: Array<{ kind: string; v?: unknown }> }) => {
    queries.push(q);
    const start = q.cons.find(c => c.kind === 'startAt')?.v as string | undefined;
    const end = q.cons.find(c => c.kind === 'endAt')?.v as string | undefined;
    const docs = SEGMENTS.filter(s => !start || (s.geohash >= start && s.geohash <= (end ?? '~')))
      .map(({ id, ...d }) => ({ id, data: () => d }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  },
}));

// ── Mapbox: a ~3 km square loop around U with 120 vertices, whatever is asked.
const mapboxCalls: Array<{ extra: Record<string, string | undefined> | undefined }> = [];
function squareLoop(): [number, number][] {
  const s = 0.75 / 111.32, t = 0.75 / 94.4, pts: [number, number][] = [];
  const corners: [number, number][] = [[U.lng, U.lat], [U.lng + t, U.lat], [U.lng + t, U.lat + s], [U.lng, U.lat + s], [U.lng, U.lat]];
  for (let c = 1; c < corners.length; c++) for (let k = 0; k < 30; k++) {
    const f = k / 30; pts.push([corners[c - 1][0] + (corners[c][0] - corners[c - 1][0]) * f, corners[c - 1][1] + (corners[c][1] - corners[c - 1][1]) * f]);
  }
  pts.push([U.lng, U.lat]);
  return pts;
}
vi.mock('../mapbox.service', () => ({
  MapboxService: {
    getSmartPath: vi.fn(async (_s: unknown, _e: unknown, _p: unknown, _w: unknown, extra?: Record<string, string>) => {
      mapboxCalls.push({ extra });
      return { path: squareLoop(), distance: 3000, duration: 2100, steps: [], legs: [] };
    }),
    getSmartPathAlternatives: vi.fn(async () => []),
  },
}));
vi.mock('../generator-elevation.service', () => ({ computeGeneratorDifficulty: async () => ({ difficulty: 'easy' }) }));
vi.mock('@/lib/route-quality/osm-layer-cache', () => ({ getOsmRoadLayerWithin: async () => null }));

import { generateDynamicRoutes } from '../route-generator.service';

const run = (routeQualityV1?: boolean) => generateDynamicRoutes({
  userLocation: U, targetDistance: 3, activity: 'running', routeGenerationIndex: 1,
  preferences: { includeStrength: false, maxRoutes: 3, idealWaypointDistanceKm: 0.5 },
  parks: [], cityName: 'תל אביב-יפו',
  ...(routeQualityV1 === undefined ? {} : { routeQualityV1 }),
} as Parameters<typeof generateDynamicRoutes>[0]);

beforeEach(() => { queries.length = 0; mapboxCalls.length = 0; });

describe('route generator — enable_route_quality_v1 OFF (default) is the legacy pipeline', () => {
  it('uses the legacy whole-radius geohash query and the legacy Mapbox params, returns legacy attributes', async () => {
    const routes = await run();
    expect(routes.length).toBeGreaterThan(0);
    expect(queries.every(q => !q.cons.some(c => c.kind === 'limit'))).toBe(true); // no ring sampling
    expect(mapboxCalls.length).toBeGreaterThan(0);
    for (const c of mapboxCalls) expect(c.extra).toEqual({ continue_straight: 'true', alternatives: 'false' });
    for (const r of routes) {
      expect(r.features).toMatchObject({ lit: true, trafficLoad: 'low', hasBenches: true });
      expect(r.rating).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('explicit false behaves exactly like the unset flag', async () => {
    const a = await run();
    const callsA = mapboxCalls.splice(0).map(c => c.extra);
    const qa = queries.splice(0).length;
    const b = await run(false);
    expect(mapboxCalls.map(c => c.extra)).toEqual(callsA);
    expect(queries.length).toBe(qa);
    const strip = (rs: typeof a) => rs.map(r => ({ ...r, id: '', rating: 0 }));
    expect(strip(b)).toEqual(strip(a));
  });
});

describe('route generator — enable_route_quality_v1 ON', () => {
  it('ring-samples Firestore, pins waypoints for Mapbox and stops inventing attributes', async () => {
    const routes = await run(true);
    expect(routes.length).toBeGreaterThan(0);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every(q => q.cons.some(c => c.kind === 'limit' && c.v === 10))).toBe(true);
    const first = mapboxCalls[0].extra!;
    expect(first.walkway_bias).toBe('1');
    expect(first.radiuses).toMatch(/^unlimited;25;25;25;unlimited$/);
    expect(first.continue_straight).toBe('true');
    for (const r of routes) {
      expect(r.rating).toBe(0);
      expect(r.features).toMatchObject({ hasBenches: false, lit: undefined, trafficLoad: 'unknown' });
    }
  });
});
