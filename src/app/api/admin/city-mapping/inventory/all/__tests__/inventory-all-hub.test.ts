import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { loadHubRows } from '@/features/admin/services/city-mapping-hub.service';

/**
 * GET /api/admin/city-mapping/inventory/all?view=hub — city-mapping hub H0.
 * Synthetic data: an authority with no inventory still gets a row ("not
 * measured"), pending counts by authorityId AND legacy city name, flag gate.
 */
const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  reads: 0,
  denied: null as null | number,
  flagOn: true,
}));

const children = (path: string) => Array.from(state.store.entries())
  .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
  .map(([k, d]) => ({ id: k.slice(path.length + 1), exists: true, data: () => d }));

function makeDb() {
  const q = (path: string, filter?: [string, unknown]) => ({
    select: () => ({
      get: async () => { state.reads++; return { docs: children(path).filter((d) => !filter || d.data()[filter[0]] === filter[1]) }; },
    }),
    get: async () => { state.reads++; return { docs: children(path).filter((d) => !filter || d.data()[filter[0]] === filter[1]) }; },
  });
  return {
    collection: (path: string) => ({
      ...q(path),
      doc: (id: string) => ({ path: `${path}/${id}`, id }),
      where: (f: string, _op: string, v: unknown) => q(path, [f, v]),
    }),
    getAll: async (...args: Array<{ path: string; id: string } | object>) => {
      state.reads++;
      return (args.filter((a) => 'path' in a) as Array<{ path: string; id: string }>).map((r) => ({ id: r.id, exists: state.store.has(r.path), data: () => state.store.get(r.path) }));
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

const req = (qs = '?view=hub') => new NextRequest(`http://localhost/api/admin/city-mapping/inventory/all${qs}`);

beforeEach(() => { state.store.clear(); state.reads = 0; state.denied = null; state.flagOn = true; });

describe('GET inventory/all?view=hub', () => {
  it.each([401, 403])('guard %i passes through with zero reads', async (status) => {
    state.denied = status;
    expect((await GET(req())).status).toBe(status);
    expect(state.reads).toBe(0);
  });
  it('flag off ⇒ 403 for the hub view, zero data reads; the plain view is unaffected', async () => {
    state.flagOn = false;
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(state.reads).toBe(0);
    expect((await GET(req(''))).status).toBe(200);
  });
  it('every municipal authority gets a row; pending routes / parks / contributions counted', async () => {
    state.store.set('authorities/arad', { name: 'ערד', type: 'city', population: 26_000, coordinates: { lat: 31.26, lng: 35.21 } });
    state.store.set('authorities/rc', { name: 'שער הנגב', type: 'regional_council', isActiveClient: true });
    state.store.set('authorities/kib', { name: 'קיבוץ', type: 'settlement', parentAuthorityId: 'rc' });
    state.store.set('authorities/unit', { name: 'גדוד', type: 'military_unit' });
    state.store.set('official_routes/r1', { city: 'ערד', published: false, status: 'pending' });
    state.store.set('official_routes/r2', { authorityId: 'arad', published: false, status: 'archived' });
    state.store.set('official_routes/r3', { authorityId: 'arad', published: true });
    state.store.set('parks/p1', { authorityId: 'rc', published: false, contentStatus: 'pending_review' });
    state.store.set('parks/p2', { authorityId: 'rc', published: false, contentStatus: 'draft' });
    state.store.set('user_contributions/c1', { authorityId: 'arad', status: 'pending' });
    state.store.set('user_contributions/c2', { status: 'pending' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = JSON.parse(JSON.stringify(await res.json()));
    expect(body.rows).toEqual([]);
    const rows = await loadHubRows((async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
    const byId = Object.fromEntries(rows.map((r) => [r.authorityId, r]));
    expect(Object.keys(byId).sort()).toEqual(['arad', 'rc']);
    expect(byId.arad).toMatchObject({ measured: false, level: null, approvedRoutes: 1, pendingRoutes: 1, pendingContributions: 1, center: { lat: 31.26, lng: 35.21 } });
    expect(byId.rc).toMatchObject({ pendingParks: 1, isActiveClient: true, authorityType: 'regional_council', quota: { min: 10, max: 20 } });
  });
});
