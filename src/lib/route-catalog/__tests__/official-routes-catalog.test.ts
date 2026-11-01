import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => { throw new Error('not used'); } }));

import { toCatalogRoute, parseCatalogSelection, CATALOG_DROPPED_FIELDS } from '../official-routes-catalog.server';

describe('toCatalogRoute', () => {
  it('drops published:false, keeps absent published (axiom §33)', () => {
    expect(toCatalogRoute('a', { published: false })).toBeNull();
    expect(toCatalogRoute('b', { name: 'x' })).toEqual({ name: 'x', id: 'b' });
  });

  it('strips only import bookkeeping; every app-read field survives', () => {
    const data: Record<string, unknown> = {
      name: 'n', path: [{ lng: 1, lat: 2 }], analytics: { usageCount: 3 }, adminRating: 4, isPromoted: true,
      provenance: { osm: true }, trail: { license: 'ODbL-1.0' }, qualitySignals: { lighting: { isLit: true } },
      infrastructureMode: 'cycling', displayRole: 'connector', authorityId: 'sderot', city: 'שדרות',
    };
    for (const f of CATALOG_DROPPED_FIELDS) data[f] = 'x';
    const out = toCatalogRoute('r', data)!;
    for (const f of CATALOG_DROPPED_FIELDS) expect(Object.prototype.hasOwnProperty.call(out, f)).toBe(false);
    for (const k of Object.keys(data).filter((k) => !(CATALOG_DROPPED_FIELDS as readonly string[]).includes(k))) {
      expect(out[k]).toEqual(data[k]);
    }
  });

  it('serialises Timestamps (also nested) to ISO strings so the JSON is plain', () => {
    const ts = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));
    const out = toCatalogRoute('t', { publishedAt: ts, qualitySignals: { computedAt: ts } })!;
    expect(out.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect((out.qualitySignals as { computedAt: unknown }).computedAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('parseCatalogSelection', () => {
  const p = (q: string) => parseCatalogSelection(new URLSearchParams(q));
  it('no scoped → legacy; scoped keeps client order, dedupes, allows none', () => {
    expect(p('')).toEqual({ scoped: false });
    expect(p('authorityIds=a')).toEqual({ scoped: false });
    expect(p('scoped=1&authorityIds=b,a,b')).toEqual({ scoped: true, authorityIds: ['b', 'a'] });
    expect(p('scoped=1')).toEqual({ scoped: true, authorityIds: [] });
  });
  it('rejects path-like ids and more than 10 authorities', () => {
    expect(p('scoped=1&authorityIds=a/b')).toBeNull();
    expect(p(`scoped=1&authorityIds=${Array.from({ length: 11 }, (_, i) => `c${i}`).join(',')}`)).toBeNull();
  });
});
