import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { writeCityInventory, type InventoryDb } from '@/lib/city-inventory/store';
import { computeReadiness } from '@/lib/city-inventory/readiness';
import type { CityInventoryInput } from '@/lib/city-inventory/doc';
import { NOW, allMeasured } from '@/lib/city-inventory/__tests__/fixtures';
import { loadCityInventoryOverview } from '@/features/admin/services/city-inventory-health';

/**
 * GET /api/admin/city-mapping/inventory/all — RC8 step 5. Synthetic data only.
 * Write (real I0 writer, Timestamp-shaped values without getTime) ⇒ route ⇒
 * JSON ⇒ the table's real client loader (axioms §31).
 */
const state = vi.hoisted(() => ({ store: new Map<string, unknown>(), reads: 0, denied: null as null | number, fail: false }));

class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate(): Date { return new Date(this.ms); }
  toMillis(): number { return this.ms; }
}
const SERVER_TS = Symbol('serverTimestamp');
function coerce(v: unknown): unknown {
  if (v === undefined) throw new Error('Firestore rejects undefined');
  if (v === SERVER_TS) return new FakeTimestamp(Date.parse('2026-10-22T05:00:00Z'));
  if (v instanceof Date) return new FakeTimestamp(v.getTime());
  if (Array.isArray(v)) return v.map(coerce);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, coerce(x)]));
  return v;
}
const children = (path: string) => Array.from(state.store.entries())
  .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
  .map(([k, d]) => ({ id: k.slice(path.length + 1), exists: true, data: () => d as Record<string, unknown> }));

function makeDb() {
  const read = () => { state.reads++; if (state.fail) throw new Error('boom'); };
  return {
    doc: (path: string) => ({ path }),
    batch: () => {
      const ops: Array<[string, unknown]> = [];
      return { set: (ref: { path: string }, data: unknown) => { ops.push([ref.path, coerce(data)]); }, commit: async () => { for (const [p, d] of ops) state.store.set(p, d); } };
    },
    collection: (path: string) => ({
      doc: (id: string) => ({ path: `${path}/${id}`, id }),
      get: async () => { read(); return { docs: children(path) }; },
      where: (f: string, _op: string, v: unknown) => ({
        select: () => ({ get: async () => { read(); return { docs: children(path).filter((d) => d.data()[f] === v) }; } }),
      }),
    }),
    getAll: async (...args: Array<{ path: string; id: string } | object>) => {
      read();
      return (args.filter((a) => 'path' in a) as Array<{ path: string; id: string }>).map((r) => ({ id: r.id, exists: state.store.has(r.path), data: () => state.store.get(r.path) as Record<string, unknown> }));
    },
  };
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () => (state.denied ? NextResponse.json({ error: 'Forbidden' }, { status: state.denied }) : null),
}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => makeDb() }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/admin/city-mapping/inventory/all');

function input(id: string, city: string): CityInventoryInput {
  const layers = allMeasured();
  const readiness = computeReadiness({ hasBoundary: true, osmSnapshotDate: '2026-10-01', approvedRoutes: 3, authorityType: 'city', population: 215_000, layers });
  return { authorityId: id, city, authorityType: 'city', areaKm2: 100, snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 't', runId: 'ci-1' }, layers, readiness };
}

beforeEach(() => { state.store.clear(); state.reads = 0; state.denied = null; state.fail = false; });

describe('GET /api/admin/city-mapping/inventory/all', () => {
  it.each([401, 403])('passes the guard\'s %i through with zero reads', async (status) => {
    state.denied = status;
    expect((await GET(req())).status).toBe(status);
    expect(state.reads).toBe(0);
  });
  it('empty collection ⇒ rows []', async () => {
    const json = await (await GET(req())).json();
    expect(json).toEqual({ rows: [] });
  });
  it('write ⇒ route ⇒ client loader: quota, approved routes (by id + legacy city name), dates', async () => {
    await writeCityInventory(makeDb() as unknown as InventoryDb, input('bsv', 'באר שבע'), SERVER_TS);
    state.store.set('authorities/bsv', { name: 'באר שבע', type: 'city', population: 215_000 });
    state.store.set('official_routes/r1', { authorityId: 'bsv', published: true });
    state.store.set('official_routes/r2', { city: 'באר שבע', published: true });
    state.store.set('official_routes/r3', { authorityId: 'bsv', published: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = JSON.parse(JSON.stringify(await res.json()));
    const rows = await loadCityInventoryOverview((async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ authorityId: 'bsv', city: 'באר שבע', approvedRoutes: 2, quota: { min: 25, max: 40 }, lastRefreshAt: '2026-10-22T05:00:00.000Z' });
  });
  it('500 with a generic message when a read fails', async () => {
    state.fail = true;
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('city inventory overview read failed');
  });
});
