import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GH, fakeClient } from '@/lib/routing/__tests__/fixtures';
import type { GraphHopperClient, GhRouteRequest } from '@/lib/routing/graphhopper';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  limited: false,
  rlKeys: [] as string[],
  client: null as GraphHopperClient | null,
  shadeCity: null as string | null,
  shadeLookups: [] as Array<string | null>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }), getAdminDb: () => ({}) }));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: async (_db: unknown, key: string) => { state.rlKeys.push(key); return state.limited ? { limited: true, retryAfterMs: 30_000 } : { limited: false }; },
}));
vi.mock('@/lib/routing/graphhopper/server-client', () => ({ getServerGraphHopperClient: () => state.client }));
vi.mock('@/lib/routing/osm-layer-server', () => ({ fetchOsmLayerForLoop: async () => null }));
vi.mock('@/lib/routing/shade-loader.server', async () => {
  const { buildShadeIndex } = await import('@/lib/shade');
  return {
    getServerShadeLoader: () => ({
      indexFor: async () => null,
      indexForName: async (name: string | null) => {
        state.shadeLookups.push(name);
        // An empty layer: the city "has data" but no loop is covered → not_measured.
        return state.shadeCity ? { city: state.shadeCity, index: buildShadeIndex([]) } : null;
      },
    }),
  };
});

import { POST } from '../route';

const call = (body: unknown, token: string | null = 'good') => POST({
  headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  json: async () => body,
  nextUrl: new URL('https://outrun.co.il/api/routes/generate'),
} as unknown as NextRequest);

const loopBody = { mode: 'loop', start: GH.start, targetKm: 5, activity: 'running', seed: 0 };
const byRequest = (b: GhRouteRequest) => (b.algorithm !== 'round_trip' ? GH.sliver3km : [GH.passing5km, GH.spurry5km, GH.passing5kmB][b['round_trip.seed']! % 3]);

beforeEach(() => {
  state.verifyIdToken.mockReset().mockImplementation(async (t: string) => { if (t !== 'good') throw new Error('bad'); return { uid: 'u1' }; });
  state.limited = false;
  state.rlKeys = [];
  state.client = fakeClient(byRequest);
  state.shadeCity = null;
  state.shadeLookups = [];
});

describe('POST /api/routes/generate', () => {
  it('401 without / with an invalid Firebase ID token — GraphHopper never called', async () => {
    const c = fakeClient(byRequest); state.client = c;
    expect((await call(loopBody, null)).status).toBe(401);
    expect((await call(loopBody, 'forged')).status).toBe(401);
    expect(c.bodies).toHaveLength(0);
  });
  it('400 on a bad body', async () => {
    const res = await call({ ...loopBody, start: { lat: 0, lng: 0 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_start' });
  });
  it('503 when GraphHopper is not configured', async () => {
    state.client = null;
    expect((await call(loopBody)).status).toBe(503);
  });
  it('429 with Retry-After when the per-uid limit is hit', async () => {
    state.limited = true;
    const res = await call(loopBody);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(state.rlKeys).toEqual(['routes-generate:uid:u1']);
  });
  it('200: top-3 loops, compact DTOs, clean loops first', async () => {
    const res = await call(loopBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backend).toBe('graphhopper');
    expect(body.loops).toHaveLength(3);
    expect(body.loops[0]).toMatchObject({ source: 'round_trip', pass: true, unmarkedCrossingsPerKm: null });
    expect(body.loops[0].path[0]).toHaveLength(2);
    expect(body.osmLayer).toBe(false);
    expect(body.loops[0]).not.toHaveProperty('metrics');
  });
  it('502 when every GraphHopper call fails', async () => {
    state.client = fakeClient(() => new Error('connect ECONNREFUSED'));
    expect((await call(loopBody)).status).toBe(502);
  });
  it('A→B friendly route', async () => {
    const res = await call({ mode: 'ab', from: GH.start, to: { lat: 32.0571, lng: 34.7687 }, activity: 'walking' });
    expect(res.status).toBe(200);
    expect((await res.json()).route.distanceKm).toBeCloseTo(3.104, 2);
  });

  it('preferShade: asks for the shade layer of the given city and reports why it was not applied', async () => {
    const res = await call({ ...loopBody, preferShade: true, city: 'זכרון יעקב' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(state.shadeLookups).toEqual(['זכרון יעקב']);
    expect(body.loops.length).toBeLessThanOrEqual(3);
    expect(body.shade).toEqual({ requested: true, applied: false, city: null, reason: 'no_shade_data' });
    expect(body.loops[0]).toHaveProperty('shadeShare', null);
  });
  it('preferShade in a city with a layer that covers none of the loops → not_measured, same top 3', async () => {
    const plain = await (await call(loopBody)).json();
    state.shadeCity = 'tel-aviv';
    const body = await (await call({ ...loopBody, preferShade: true, city: 'תל אביב-יפו' })).json();
    expect(body.shade).toMatchObject({ applied: false, city: 'tel-aviv', reason: 'not_measured' });
    expect(body.loops.map((l: { path: unknown }) => l.path)).toEqual(plain.loops.map((l: { path: unknown }) => l.path));
  });
  it('without preferShade the response has no shade fields and the loader is never touched', async () => {
    const body = await (await call(loopBody)).json();
    expect(body).not.toHaveProperty('shade');
    expect(body.loops[0]).not.toHaveProperty('shadeShare');
    expect(state.shadeLookups).toEqual([]);
  });
});
