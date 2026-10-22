import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { loadHubLayer } from '@/features/admin/services/city-mapping-hub.service';

/** GET /api/admin/city-mapping/hub/layers — guard, flag, validation, legacy city fallback. Synthetic data. */
const state = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>(), reads: 0, denied: null as null | number, flagOn: true }));

type Doc = { id: string; exists: boolean; data: () => Record<string, unknown> | undefined };
const docsOf = (path: string): Doc[] => Array.from(state.store.entries())
  .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
  .map(([k, d]) => ({ id: k.slice(path.length + 1), exists: true, data: () => d }));

function makeDb() {
  const query = (path: string, preds: Array<(d: Record<string, unknown>) => boolean>) => ({
    where: (f: string, op: string, v: unknown) => query(path, [...preds, (d) => (op === 'in' ? (v as unknown[]).includes(d[f]) : d[f] === v)]),
    select: () => query(path, preds),
    get: async () => { state.reads++; return { docs: docsOf(path).filter((d) => preds.every((p) => p(d.data()!))) }; },
  });
  return {
    collection: (path: string) => ({
      ...query(path, []),
      doc: (id: string) => ({
        path: `${path}/${id}`, id,
        get: async () => { state.reads++; const d = state.store.get(`${path}/${id}`); return { id, exists: !!d, data: () => d }; },
      }),
    }),
    getAll: async (...refs: Array<{ path?: string; id?: string }>) => {
      state.reads++;
      return refs.filter((r) => r.path).map((r) => { const d = state.store.get(r.path!); return { id: r.id, exists: !!d, data: () => d }; });
    },
  };
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () => (state.denied ? NextResponse.json({ error: 'Forbidden' }, { status: state.denied }) : null),
}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => makeDb() }));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ enableCityMappingHub: state.flagOn }) }));

import { GET } from '../route';

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/city-mapping/hub/layers?${qs}`);
const path = [{ lng: 34.6, lat: 31.5 }, { lng: 34.61, lat: 31.51 }];

beforeEach(() => { state.store.clear(); state.reads = 0; state.denied = null; state.flagOn = true; });

describe('GET /api/admin/city-mapping/hub/layers', () => {
  it.each([401, 403])('guard %i first, zero reads', async (s) => {
    state.denied = s;
    expect((await GET(req('authorityId=a&layer=routes'))).status).toBe(s);
    expect(state.reads).toBe(0);
  });
  it.each([
    ['authorityId=a%2Fb&layer=routes', 'invalid authorityId'],
    ['authorityId=&layer=routes', 'invalid authorityId'],
    ['authorityId=a&layer=users', 'unknown layer'],
  ])('400 for %s', async (qs, msg) => {
    const res = await GET(req(qs));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(msg);
    expect(state.reads).toBe(0);
  });
  it('flag off ⇒ 403, zero data reads', async () => {
    state.flagOn = false;
    expect((await GET(req('authorityId=a&layer=routes'))).status).toBe(403);
    expect(state.reads).toBe(0);
  });
  it('unknown authority ⇒ 404', async () => {
    expect((await GET(req('authorityId=ghost&layer=routes'))).status).toBe(404);
  });
  it('routes: by authorityId + legacy city name (Sderot shape), other authority\'s same-name route excluded, archived hidden', async () => {
    state.store.set('authorities/sderot', { name: 'שדרות' });
    state.store.set('official_routes/r1', { authorityId: 'sderot', published: true, path });
    state.store.set('official_routes/r2', { city: 'שדרות', published: false, status: 'pending', path });
    state.store.set('official_routes/r3', { city: 'שדרות', published: false, status: 'archived', path });
    state.store.set('official_routes/r4', { city: 'שדרות', authorityId: 'other', published: true, path });
    const res = await GET(req('authorityId=sderot&layer=routes'));
    expect(res.status).toBe(200);
    const body = JSON.parse(JSON.stringify(await res.json()));
    const p = await loadHubLayer('sderot', 'routes', (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
    expect(p.featureCollection.features.map((f) => [f.id, f.properties?.status]).sort()).toEqual([['r1', 'approved'], ['r2', 'pending']]);
  });
  it('boundary from the authority doc', async () => {
    state.store.set('authorities/a', { name: 'א', boundaryGeoJSON: JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[34, 31], [35, 31], [35, 32], [34, 31]]] } }) });
    const body = await (await GET(req('authorityId=a&layer=boundary'))).json();
    expect(body.featureCollection.features).toHaveLength(1);
  });
});
