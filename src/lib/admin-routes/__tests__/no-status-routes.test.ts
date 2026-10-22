import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createFakeDb } from '../../admin-analytics/__tests__/fake-db';
import { computeNoStatusRoutes } from '../no-status-routes.server';

const routes = {
  sd1: { name: 'שדרות 1', city: 'שדרות', authorityId: 'sderot', distance: 3.2, activityType: 'running' }, // no published, no status
  sd2: { name: 'שדרות 2', city: 'שדרות', authorityId: 'sderot', published: null },
  sd3: { name: 'שדרות 3', city: 'שדרות', authorityId: 'sderot', published: false, status: 'pending' }, // already in the queue
  sd4: { name: 'שדרות 4', city: 'שדרות', authorityId: 'sderot', published: true, status: 'published' },
  hf1: { name: 'חיפה 1', city: 'חיפה', authorityId: 'haifa', status: 'archived' }, // live despite archived → listed
  legacy: { name: 'ישן', city: 'זכרון יעקב' }, // no authorityId, no published
};

describe('computeNoStatusRoutes', () => {
  it("scope 'all' lists every doc with no published field (absent or null), incl. no-authority ones", async () => {
    const db = createFakeDb({ official_routes: routes });
    const res = await computeNoStatusRoutes(db, { kind: 'all' });
    expect(res.rows.map((r) => r.id).sort()).toEqual(['hf1', 'legacy', 'sd1', 'sd2']);
    expect(res.scanned).toBe(6);
    expect(res.truncated).toBe(false);
    const sd1 = res.rows.find((r) => r.id === 'sd1')!;
    expect(sd1).toMatchObject({ name: 'שדרות 1', city: 'שדרות', authorityId: 'sderot', distance: 3.2, activityType: 'running', status: null });
    expect(res.rows.find((r) => r.id === 'hf1')!.status).toBe('archived');
  });

  it("scope 'authority' never returns another authority's rows or no-authority rows", async () => {
    const db = createFakeDb({ official_routes: routes });
    const res = await computeNoStatusRoutes(db, { kind: 'authority', authorityId: 'sderot' });
    expect(res.rows.map((r) => r.id).sort()).toEqual(['sd1', 'sd2']);
    expect(res.scanned).toBe(4);
  });

  it('never lists a doc with an explicit published boolean (the normal queue owns those)', async () => {
    const db = createFakeDb({ official_routes: { a: { published: false }, b: { published: true } } });
    expect((await computeNoStatusRoutes(db, { kind: 'all' })).rows).toEqual([]);
  });
});
