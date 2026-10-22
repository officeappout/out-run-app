/**
 * enable_scoped_official_routes — the app's official_routes read.
 *   OFF → byte-identical legacy query: official_routes + limit(200), nothing else.
 *   ON  → `authorityId in [user's authorities]` + limit(300), published===false dropped
 *         client-side (absent `published` stays visible, axiom §33); else / empty →
 *         `published == true` + limit(200). One shared read for concurrent callers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';
import { resolveOfficialRoutesScope, chunkIds } from '../official-routes-scope';

type Doc = { id: string; data: Record<string, unknown> };
const h = vi.hoisted(() => ({
  queries: [] as Array<{ col: string; constraints: Array<Record<string, unknown>> }>,
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  profile: null as null | { core: Record<string, unknown> },
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
    query: vi.fn((col: { __col: string }, ...constraints: Array<Record<string, unknown>>) => ({ __col: col.__col, constraints })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
    limit: vi.fn((n: number) => ({ type: 'limit', value: n })),
    getDocs: vi.fn(async (q: { __col: string; constraints: Array<Record<string, unknown>> }) => {
      h.queries.push({ col: q.__col, constraints: q.constraints });
      let rows = h.docs;
      let lim = Infinity;
      for (const c of q.constraints) {
        if (c.type === 'limit') lim = c.value as number;
        if (c.type === 'where' && c.op === 'in') rows = rows.filter((d) => (c.value as unknown[]).includes(d.data[c.field as string]));
        if (c.type === 'where' && c.op === '==') rows = rows.filter((d) => d.data[c.field as string] === c.value);
      }
      const docs = rows.slice(0, lim).map((d) => ({ id: d.id, data: () => d.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }),
  };
});
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: h.profile }) },
}));

const path = [{ lng: 34.6, lat: 31.5 }, { lng: 34.61, lat: 31.51 }];
const route = (id: string, extra: Record<string, unknown>): Doc => ({ id, data: { name: id, path, ...extra } });

function setFlag(on: boolean | null) {
  const store = new Map<string, string>();
  if (on !== null) store.set(LIVE_FLAGS_CACHE_KEY, JSON.stringify({ enableScopedOfficialRoutes: on }));
  (globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null } };
}

let svc: typeof import('../inventory.service');
beforeEach(async () => {
  h.queries = [];
  h.profile = null;
  h.docs = [
    route('sd-absent', { authorityId: 'sderot' }), // no published field — live today
    route('sd-pub', { authorityId: 'sderot', published: true }),
    route('sd-pending', { authorityId: 'sderot', published: false, status: 'pending' }),
    route('hf-pub', { authorityId: 'haifa', published: true }),
    route('legacy', { published: true }), // no authorityId
  ];
  svc = await import('../inventory.service');
  svc.invalidateOfficialRoutesCache();
});
afterEach(() => {
  delete (globalThis as any).window;
});

const ids = (rs: Array<{ id: string }>) => rs.map((r) => r.id).sort();

describe('flag definition', () => {
  it('enable_scoped_official_routes is fail-closed and the same for admins', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_scoped_official_routes');
    expect(def).toMatchObject({ key: 'enableScopedOfficialRoutes', defaultValue: false, superAdminValue: false });
  });
});

describe('getCachedOfficialRoutes — flag OFF (legacy, unchanged)', () => {
  for (const state of [false, null] as const) {
    it(`flag ${state === null ? 'absent' : 'false'} → whole-collection limit(200), no where`, async () => {
      setFlag(state);
      h.profile = { core: { authorityId: 'sderot' } };
      const routes = await svc.getCachedOfficialRoutes();
      expect(h.queries).toEqual([{ col: 'official_routes', constraints: [{ type: 'limit', value: 200 }] }]);
      expect(ids(routes)).toEqual(['hf-pub', 'legacy', 'sd-absent', 'sd-pub']);
    });
  }
});

describe('getCachedOfficialRoutes — flag ON (scoped)', () => {
  beforeEach(() => setFlag(true));

  it("reads only the user's authorities; absent published stays visible, published:false dropped", async () => {
    h.profile = { core: { authorityId: 'sderot' } };
    const routes = await svc.getCachedOfficialRoutes();
    expect(h.queries).toEqual([{
      col: 'official_routes',
      constraints: [{ type: 'where', field: 'authorityId', op: 'in', value: ['sderot'] }, { type: 'limit', value: 300 }],
    }]);
    expect(ids(routes)).toEqual(['sd-absent', 'sd-pub']);
  });

  it('adds the GPS city affiliation (traveller) to the scope', async () => {
    h.profile = { core: { authorityId: 'sderot', affiliations: [{ type: 'city', id: 'haifa' }, { type: 'school', id: 'x' }] } };
    const routes = await svc.getCachedOfficialRoutes();
    expect(h.queries[0].constraints[0]).toEqual({ type: 'where', field: 'authorityId', op: 'in', value: ['sderot', 'haifa'] });
    expect(ids(routes)).toEqual(['hf-pub', 'sd-absent', 'sd-pub']);
  });

  it('no authority known → published == true, limit(200)', async () => {
    const routes = await svc.getCachedOfficialRoutes();
    expect(h.queries).toEqual([{
      col: 'official_routes',
      constraints: [{ type: 'where', field: 'published', op: '==', value: true }, { type: 'limit', value: 200 }],
    }]);
    expect(ids(routes)).toEqual(['hf-pub', 'legacy', 'sd-pub']);
  });

  it('authority with no routes (e.g. a military unit) → falls back to published-only', async () => {
    h.profile = { core: { authorityId: 'unit_9307' } };
    const routes = await svc.getCachedOfficialRoutes();
    expect(h.queries).toHaveLength(2);
    expect(h.queries[1].constraints[0]).toEqual({ type: 'where', field: 'published', op: '==', value: true });
    expect(ids(routes)).toEqual(['hf-pub', 'legacy', 'sd-pub']);
  });

  it('concurrent callers share ONE read; the cache serves later calls; a new authority re-reads', async () => {
    h.profile = { core: { authorityId: 'sderot' } };
    const [a, b, c] = await Promise.all([svc.getCachedOfficialRoutes(), svc.getCachedOfficialRoutes(), svc.getCachedOfficialRoutes()]);
    expect(h.queries).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    await svc.getCachedOfficialRoutes();
    expect(h.queries).toHaveLength(1);
    h.profile = { core: { authorityId: 'haifa' } };
    expect(ids(await svc.getCachedOfficialRoutes())).toEqual(['hf-pub']);
    expect(h.queries).toHaveLength(2);
  });

  it('invalidateOfficialRoutesCache forces a re-read', async () => {
    h.profile = { core: { authorityId: 'sderot' } };
    await svc.getCachedOfficialRoutes();
    svc.invalidateOfficialRoutesCache();
    await svc.getCachedOfficialRoutes();
    expect(h.queries).toHaveLength(2);
  });
});

describe('resolveOfficialRoutesScope (pure)', () => {
  it('dedupes, ignores non-city affiliations and junk, stable key', () => {
    const s = resolveOfficialRoutesScope({ authorityId: 'b', affiliations: [{ type: 'city', id: 'a' }, { type: 'city', id: 'b' }, { type: 'company', id: 'c' }, { type: 'city', id: 'x/y' }, null] });
    expect(s.authorityIds).toEqual(['b', 'a']);
    expect(s.key).toBe('auth:a,b');
  });
  it('nothing known → published-only key', () => {
    expect(resolveOfficialRoutesScope(undefined)).toEqual({ authorityIds: [], key: 'published-only' });
    expect(resolveOfficialRoutesScope({ authorityId: '' })).toEqual({ authorityIds: [], key: 'published-only' });
  });
  it('caps the fan-out at 10 authorities and chunks `in` at 30', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ type: 'city', id: `c${i}` }));
    expect(resolveOfficialRoutesScope({ affiliations: many }).authorityIds).toHaveLength(10);
    expect(chunkIds(Array.from({ length: 61 }, (_, i) => `x${i}`)).map((c) => c.length)).toEqual([30, 30, 1]);
  });
});
