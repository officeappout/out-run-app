/**
 * RC10 — getCachedOfficialRoutes (every user-facing list) skips connector
 * routes only while enable_hide_route_connectors is on — on BOTH read paths
 * (legacy and enable_scoped_official_routes). The behind-the-scenes reader
 * (getCachedOfficialRoutesIncludingConnectors) always keeps them, on both paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';

const h = vi.hoisted(() => ({
  reads: 0,
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
    getDocs: vi.fn(async (q: { constraints: Array<Record<string, unknown>> }) => {
      h.reads++;
      let rows = h.docs;
      for (const c of q.constraints ?? []) {
        if (c.type === 'where' && c.op === 'in') rows = rows.filter((d) => (c.value as unknown[]).includes(d.data[c.field as string]));
        if (c.type === 'where' && c.op === '==') rows = rows.filter((d) => d.data[c.field as string] === c.value);
      }
      const docs = rows.map((d) => ({ id: d.id, data: () => d.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    }),
  };
});
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: h.profile }) },
}));

const path = [{ lng: 34.6, lat: 31.5 }, { lng: 34.61, lat: 31.5 }];

let store: Record<string, string> = {};
function setFlags(flags: { hide?: boolean; scoped?: boolean } | null) {
  store = flags == null ? {} : {
    [LIVE_FLAGS_CACHE_KEY]: JSON.stringify({
      ...(flags.hide != null ? { enableHideRouteConnectors: flags.hide } : {}),
      ...(flags.scoped != null ? { enableScopedOfficialRoutes: flags.scoped } : {}),
    }),
  };
}

let svc: typeof import('../inventory.service');
beforeEach(async () => {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
  h.reads = 0;
  h.profile = { core: { authorityId: 'sderot' } };
  h.docs = [
    { id: 'loop', data: { name: 'שכונת הכרמים קלאסי', authorityId: 'sderot', path } },
    { id: 'seg', data: { name: 'מקטע 2', authorityId: 'sderot', displayRole: 'connector', path } },
  ];
  svc = await import('../inventory.service');
  svc.invalidateOfficialRoutesCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ids = (rs: Array<{ id: string }>) => rs.map((r) => r.id);

describe.each([
  ['legacy path', false],
  ['scoped path', true],
])('getCachedOfficialRoutes — connector routes (%s)', (_label, scoped) => {
  it('hide flag off / unknown → every route, the same cached array', async () => {
    setFlags(scoped ? { scoped } : null);
    const a = await svc.getCachedOfficialRoutes();
    expect(ids(a)).toEqual(['loop', 'seg']);
    setFlags({ hide: false, scoped });
    const b = await svc.getCachedOfficialRoutes();
    expect(b).toBe(a);
    expect(b).toBe(await svc.getCachedOfficialRoutesIncludingConnectors());
  });

  it('hide flag on → connector skipped; the stitching reader still has it; no refetch on flip', async () => {
    setFlags({ hide: true, scoped });
    expect(ids(await svc.getCachedOfficialRoutes())).toEqual(['loop']);
    expect(ids(await svc.getCachedOfficialRoutesIncludingConnectors())).toEqual(['loop', 'seg']);
    setFlags({ hide: false, scoped });
    expect(ids(await svc.getCachedOfficialRoutes())).toEqual(['loop', 'seg']);
    expect(h.reads).toBe(1);
  });
});
