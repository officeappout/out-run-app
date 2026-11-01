import { describe, it, expect, vi, afterEach } from 'vitest';
import { catalogDocsToRoutes, fetchOfficialRoutesCatalog, routesCatalogUrl } from '../routes-catalog.client';

const path = [{ lng: 34.6, lat: 31.5 }, { lng: 34.61, lat: 31.51 }];

describe('routes catalog client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('legacy vs scoped URLs', () => {
    expect(routesCatalogUrl(null)).toBe('/api/catalog/routes');
    expect(routesCatalogUrl([])).toBe('/api/catalog/routes?scoped=1&authorityIds=');
    expect(routesCatalogUrl(['a b', 'c'])).toBe('/api/catalog/routes?scoped=1&authorityIds=a%20b,c');
  });

  it('applies the same per-doc normaliser as the old Firestore reads', () => {
    const routes = catalogDocsToRoutes([
      { id: 'ok', path },
      { id: 'short', path: [path[0]] },
      { id: 'hidden', path, published: false },
      null,
    ]);
    expect(routes.map((r) => r.id)).toEqual(['ok']);
    expect(routes[0].path).toEqual([[34.6, 31.5], [34.61, 31.51]]);
  });

  it('never throws: a failed request with no stored copy resolves to []', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(fetchOfficialRoutesCatalog(null)).resolves.toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchOfficialRoutesCatalog(['sderot'])).resolves.toEqual([]);
  });
});
