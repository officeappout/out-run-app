/**
 * RC10 — getCachedOfficialRoutes (every user-facing list) skips connector
 * routes only while enable_hide_route_connectors is on; the behind-the-scenes
 * reader (getCachedOfficialRoutesIncludingConnectors) always keeps them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';

const docs = [
  { id: 'loop', data: { name: 'שכונת הכרמים קלאסי', path: [{ lng: 34.6, lat: 31.5 }, { lng: 34.61, lat: 31.5 }] } },
  { id: 'seg', data: { name: 'מקטע 2', displayRole: 'connector', path: [{ lng: 34.6, lat: 31.51 }, { lng: 34.61, lat: 31.51 }] } },
];
const getDocs = vi.fn(async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), getDoc: vi.fn(), getDocs: () => getDocs(), writeBatch: vi.fn(), doc: vi.fn(), query: vi.fn(),
  where: vi.fn(), orderBy: vi.fn(), startAt: vi.fn(), endAt: vi.fn(), limit: vi.fn(), updateDoc: vi.fn(),
  serverTimestamp: vi.fn(), arrayUnion: vi.fn(),
}));
vi.mock('../parks.service', () => ({ getParksByAuthority: vi.fn() }));
vi.mock('../official-route-broadcaster', () => ({
  broadcastRouteToStreetSegments: vi.fn(), broadcastRoutesToStreetSegments: vi.fn(),
  deleteOfficialRouteSegments: vi.fn(), deleteOfficialRouteSegmentsForMany: vi.fn(),
}));
vi.mock('@/features/admin/services/authority.service', () => ({ getAllAuthorities: vi.fn() }));
vi.mock('@/lib/route-decisions/log-decision', () => ({ logRouteDecision: vi.fn() }));

let store: Record<string, string> = {};
function setFlag(on: boolean | null) {
  store = on == null ? {} : { [LIVE_FLAGS_CACHE_KEY]: JSON.stringify({ enableHideRouteConnectors: on }) };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCachedOfficialRoutes — connector routes', () => {
  it('flag off / unknown → every published route, the same cached array', async () => {
    const svc = await import('../inventory.service');
    svc.invalidateOfficialRoutesCache();
    setFlag(null);
    const a = await svc.getCachedOfficialRoutes();
    expect(a.map((r) => r.id)).toEqual(['loop', 'seg']);
    setFlag(false);
    const b = await svc.getCachedOfficialRoutes();
    expect(b).toBe(a);
    expect(b).toBe(await svc.getCachedOfficialRoutesIncludingConnectors());
  });

  it('flag on → connector skipped; the stitching reader still has it; no refetch on flip', async () => {
    const svc = await import('../inventory.service');
    svc.invalidateOfficialRoutesCache();
    getDocs.mockClear();
    setFlag(true);
    expect((await svc.getCachedOfficialRoutes()).map((r) => r.id)).toEqual(['loop']);
    expect((await svc.getCachedOfficialRoutesIncludingConnectors()).map((r) => r.id)).toEqual(['loop', 'seg']);
    setFlag(false);
    expect((await svc.getCachedOfficialRoutes()).map((r) => r.id)).toEqual(['loop', 'seg']);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});
