import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { writeCityInventory, type InventoryDb } from '@/lib/city-inventory/store';
import { computeReadiness } from '@/lib/city-inventory/readiness';
import { emptyLayer, type CityInventoryInput } from '@/lib/city-inventory/doc';
import { NOW, allMeasured, measuredLayer } from '@/lib/city-inventory/__tests__/fixtures';
import { parseCityInventoryHealth } from '@/features/admin/services/city-inventory-health';

/**
 * GET /api/admin/city-mapping/inventory — RC4 I2. Synthetic data only.
 *
 * Write ⇒ route ⇒ client round trip (axioms §31): docs are written with the
 * real I0 writer into a fake db that stores every Date / server timestamp as
 * a Timestamp-shaped object WITHOUT getTime(), read back by the real route,
 * serialised to JSON, then parsed by the card's real client parser.
 * Reads are counted so "denied ⇒ zero reads" is asserted.
 */
const state = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  reads: 0,
  denied: null as null | { status: number },
  failReads: false,
}));

class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate(): Date { return new Date(this.ms); }
  toMillis(): number { return this.ms; }
}

const SERVER_TS = Symbol('serverTimestamp');
let serverNow = new Date('2026-10-21T09:30:00Z');

function coerce(v: unknown): unknown {
  if (v === undefined) throw new Error('Firestore rejects undefined');
  if (v === SERVER_TS) return new FakeTimestamp(serverNow.getTime());
  if (v instanceof Date) return new FakeTimestamp(v.getTime());
  if (Array.isArray(v)) return v.map(coerce);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, coerce(x)]));
  return v;
}

function makeDb() {
  return {
    doc: (path: string) => ({
      path,
      get: async () => {
        state.reads++;
        if (state.failReads) throw new Error('boom');
        return { exists: state.store.has(path), data: () => state.store.get(path) };
      },
    }),
    batch: () => {
      const ops: Array<[string, unknown]> = [];
      return {
        set: (ref: { path: string }, data: unknown) => { ops.push([ref.path, coerce(data)]); },
        commit: async () => { for (const [p, d] of ops) state.store.set(p, d); },
      };
    },
    collection: (path: string) => ({
      orderBy: (field: string, dir: 'asc' | 'desc') => ({
        limit: (n: number) => ({
          get: async () => {
            state.reads++;
            if (state.failReads) throw new Error('boom');
            const rows = Array.from(state.store.entries())
              .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
              .map(([k, d]) => ({ id: k.slice(path.length + 1), d: d as Record<string, unknown> }));
            const ms = (r: { d: Record<string, unknown> }) => (r.d[field] as FakeTimestamp | undefined)?.toMillis() ?? 0;
            rows.sort((a, b) => (dir === 'desc' ? ms(b) - ms(a) : ms(a) - ms(b)));
            return { docs: rows.slice(0, n).map((r) => ({ id: r.id, data: () => r.d })) };
          },
        }),
      }),
    }),
  };
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () =>
    state.denied ? NextResponse.json({ error: state.denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: state.denied.status }) : null,
}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => makeDb() }));

import { GET } from '../route';

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/city-mapping/inventory${qs}`);

function input(runId: string, benches: number): CityInventoryInput {
  const layers = allMeasured();
  layers.benches = measuredLayer({ count: benches, density: 1.2, method: 'osm_density_vs_peers', coveragePct: null });
  layers.shade = emptyLayer(); // not measured
  const readiness = computeReadiness({ hasBoundary: true, osmSnapshotDate: '2026-10-01', approvedRoutes: 26, authorityType: 'city', population: 215_000, layers });
  return {
    authorityId: 'auth_bsv',
    city: 'באר שבע',
    authorityType: 'city',
    areaKm2: 117.5,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 'scripts/city-inventory/run.ts', runId },
    layers,
    readiness,
  };
}

async function seed(runId: string, benches: number, at: string) {
  serverNow = new Date(at);
  await writeCityInventory(makeDb() as unknown as InventoryDb, input(runId, benches), SERVER_TS);
}

beforeEach(() => {
  state.store.clear();
  state.reads = 0;
  state.denied = null;
  state.failReads = false;
});

describe('GET /api/admin/city-mapping/inventory', () => {
  it.each([401, 403])('passes the guard\'s %i through with zero reads', async (status) => {
    state.denied = { status };
    const res = await GET(req('?authorityId=auth_bsv'));
    expect(res.status).toBe(status);
    expect(state.reads).toBe(0);
  });

  it.each(['', '?authorityId=', '?authorityId=a/b', `?authorityId=${'x'.repeat(129)}`])('400 for a bad id (%s) with zero reads', async (qs) => {
    const res = await GET(req(qs));
    expect(res.status).toBe(400);
    expect(state.reads).toBe(0);
  });

  it('no doc yet ⇒ inventory null, runs [] (never zeros)', async () => {
    const res = await GET(req('?authorityId=auth_none'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ authorityId: 'auth_none', inventory: null, runs: [] });
    expect(parseCityInventoryHealth('auth_none', json).inventory).toBeNull();
  });

  it('write ⇒ route ⇒ client parse keeps values, nulls and dates (Timestamps on the server side)', async () => {
    await seed('ci-1', 40, '2026-10-20T08:00:00Z');
    await seed('ci-2', 0, '2026-10-21T08:00:00Z');
    const res = await GET(req('?authorityId=auth_bsv'));
    expect(res.status).toBe(200);
    const health = parseCityInventoryHealth('auth_bsv', JSON.parse(JSON.stringify(await res.json())));
    const inv = health.inventory!;
    expect(inv.city).toBe('באר שבע');
    expect(inv.snapshot.builtAt.toISOString()).toBe(NOW.toISOString());
    expect(inv.updatedAt?.toISOString()).toBe('2026-10-21T08:00:00.000Z');
    expect(inv.layers.benches.count).toBe(0);
    expect(inv.layers.shade.count).toBeNull();
    expect(inv.layers.shade.coveragePct).toBeNull();
    expect(inv.layers.parks.lastRefreshAt?.toISOString()).toBe(NOW.toISOString());
    expect(inv.readiness.level).toMatch(/red|yellow|green/);
    // newest first, by createdAt
    expect(health.runs.map((r) => r.runId)).toEqual(['ci-2', 'ci-1']);
    expect(health.runs[1].layers.benches.count).toBe(40);
    expect(health.runs[0].createdAt?.toISOString()).toBe('2026-10-21T08:00:00.000Z');
  });

  it('returns at most 5 runs', async () => {
    for (let i = 0; i < 7; i++) await seed(`ci-${i}`, i, `2026-10-1${i}T08:00:00Z`);
    const json = await (await GET(req('?authorityId=auth_bsv'))).json();
    expect(json.runs).toHaveLength(5);
    expect(json.runs[0].runId).toBe('ci-6');
  });

  it('500 with a generic message when the read fails', async () => {
    state.failReads = true;
    const res = await GET(req('?authorityId=auth_bsv'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('city inventory read failed');
  });
});
