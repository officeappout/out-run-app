import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const TS = vi.hoisted(() => Symbol('ts'));
vi.mock('@/lib/firebase-admin', () => ({ getAdminAuth: () => ({ getUser: async (u: string) => ({ displayName: `name-${u}` }) }) }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => TS } }));

/** Admin-SDK-shaped fake: stored Dates come back as Timestamp-like (toDate/toMillis, no getTime) — axioms §31. */
class FakeTimestamp { constructor(private d: Date) {} toDate() { return this.d; } toMillis() { return this.d.getTime(); } }
const store = new Map<string, Record<string, unknown>>();
const version = new Map<string, number>(); // path -> updateTime stand-in
let failBatch = false;
const writes: Array<{ op: string; path: string; data: Record<string, unknown> }> = [];
const wrap = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v instanceof Date ? new FakeTimestamp(v) : v]));
const ref = (path: string) => ({ path, id: path.split('/').pop()! });
const snapOf = (path: string) => ({ id: path.split('/').pop()!, exists: store.has(path), data: () => store.get(path), updateTime: version.get(path) ?? 1 });
const checkPre = (path: string, pre?: { lastUpdateTime: number }) => { if (pre && (version.get(path) ?? 1) !== pre.lastUpdateTime) throw new Error('FAILED_PRECONDITION'); };
const colSnap = (name: string, pred: (d: Record<string, unknown>) => boolean = () => true) => ({
  docs: Array.from(store.entries()).filter(([p, d]) => p.startsWith(`${name}/`) && pred(d)).map(([p]) => snapOf(p)),
});
const db = {
  collection: (c: string) => ({
    doc: (id?: string) => ({ ...ref(`${c}/${id ?? 'auto'}`), get: async () => snapOf(`${c}/${id}`),
      update: async (data: Record<string, unknown>, pre?: { lastUpdateTime: number }) => { checkPre(`${c}/${id}`, pre); writes.push({ op: 'docupdate', path: `${c}/${id}`, data }); },
      set: async (data: Record<string, unknown>) => { writes.push({ op: 'set', path: `${c}/auto`, data }); } }),
    select: () => ({ get: async () => colSnap(c), where: () => ({ select: () => ({ get: async () => colSnap(c, (d) => d.published === false) }) }) }),
    where: () => ({ select: () => ({ get: async () => colSnap(c, (d) => d.published === false) }) }),
  }),
  getAll: async (...refs: Array<{ path: string }>) => refs.filter((r) => typeof r === 'object' && 'path' in r).map((r) => snapOf(r.path)),
  batch: () => {
    const ops: typeof writes = [];
    return {
      update: (r: { path: string }, data: Record<string, unknown>, pre?: { lastUpdateTime: number }) => { checkPre(r.path, pre); ops.push({ op: 'update', path: r.path, data }); },
      set: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'set', path: r.path, data }),
      commit: async () => { if (failBatch) throw new Error('batch failed'); writes.push(...ops); },
    };
  },
};
const put = (p: string, d: Record<string, unknown>) => store.set(p, wrap(d));

import { approvePendingRoutes, parseBulkApproveRequest, readPendingRoutesNationwide } from '../bulk-routes.server';

beforeEach(() => {
  store.clear(); writes.length = 0; version.clear(); failBatch = false;
  put('authorities/a', { name: 'אילת' });
  put('authorities/b', { name: 'חיפה' });
  put('city_inventory/a', { city: 'אילת', authorityId: 'a' });
  put('official_routes/r1', { name: 'one', authorityId: 'a', published: false, status: 'pending', distance: 6, origin: 'web_research', createdAt: new Date() });
  put('official_routes/r2', { name: 'two', authorityId: 'a', published: false, status: 'pending', distance: 2 });
  put('official_routes/r3', { name: 'legacy', city: 'אילת', published: false, status: 'pending' });
  put('official_routes/r4', { name: 'archived', authorityId: 'a', published: false, status: 'archived' });
  put('official_routes/r5', { name: 'live', authorityId: 'a', published: true, status: 'published' });
  put('official_routes/r6', { name: 'noauth', published: false, status: 'pending', city: 'nowhere' });
  put('official_routes/r7', { name: 'other', authorityId: 'b', published: false, status: 'pending' });
  put('route_scores/r1', { score: 84, computedAt: new Date() });
});

describe('readPendingRoutesNationwide', () => {
  it('lists only pending, attributes legacy city docs, joins scores, counts unattributed', async () => {
    const r = await readPendingRoutesNationwide(db as never);
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['r1', 'r2', 'r3', 'r7']);
    expect(r.candidates.find((c) => c.id === 'r3')!.authorityId).toBe('a');
    expect(r.candidates.find((c) => c.id === 'r1')).toMatchObject({ score: 84, origin: 'web_research', distanceKm: 6 });
    expect(r.candidates.find((c) => c.id === 'r2')!.score).toBeNull();
    expect(r.unattributed).toBe(1);
    expect(r.authorityNames).toEqual({ a: 'אילת', b: 'חיפה' });
  });
});

describe('approvePendingRoutes', () => {
  it('writes only pending docs of that authority, skips the rest, one audit row', async () => {
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'r4', 'r5', 'r7', 'missing', 'r3'] });
    expect(out.updated.sort()).toEqual(['r1', 'r3']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]))).toEqual({ r4: 'not_pending', r5: 'not_pending', r7: 'other_authority', missing: 'not_found' });
    const upd = writes.filter((w) => w.op === 'update');
    expect(upd.map((w) => w.path).sort()).toEqual(['official_routes/r1', 'official_routes/r3']);
    expect(upd[0].data).toMatchObject({ published: true, status: 'published', publishedAt: TS, updatedAt: TS });
    expect(Object.keys(upd[0].data).sort()).toEqual(['published', 'publishedAt', 'status', 'updatedAt']);
    const audit = writes.filter((w) => w.op === 'set');
    expect(audit).toHaveLength(1);
    expect(audit[0].data).toMatchObject({ adminId: 'admin-1', adminName: 'name-admin-1', actionType: 'APPROVE', targetEntity: 'Route' });
  });
  it('writes nothing when nothing qualifies (idempotent re-run)', async () => {
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r5'] });
    expect(out.updated).toEqual([]);
    expect(writes).toHaveLength(0);
  });
});

describe('approvePendingRoutes — TOCTOU', () => {
  it('a route changed between read and write is a conflict; the others are still approved', async () => {
    // r3 gets archived after our read: bump its version inside getAll's aftermath.
    const orig = db.getAll;
    db.getAll = async (...refs: Array<{ path: string }>) => { const r = await orig(...refs); if (refs.some((x) => x.path === 'official_routes/r3')) version.set('official_routes/r3', 99); return r; };
    try {
      const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'r2', 'r3'] });
      expect(out.updated.sort()).toEqual(['r1', 'r2']);
      expect(out.skipped).toEqual([{ id: 'r3', reason: 'conflict' }]);
      expect(writes.filter((w) => w.op === 'docupdate').map((w) => w.path).sort()).toEqual(['official_routes/r1', 'official_routes/r2']);
      expect(writes.filter((w) => w.op === 'set')).toHaveLength(1);
    } finally { db.getAll = orig; }
  });
  it('a failed batch falls back to per-doc updates', async () => {
    failBatch = true;
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'r2'] });
    expect(out.updated.sort()).toEqual(['r1', 'r2']);
  });
  it('exactly the max (499 updates + audit = 500 writes) is accepted and written in one batch', async () => {
    const ids = Array.from({ length: 499 }, (_, i) => `m${i}`);
    for (const id of ids) put(`official_routes/${id}`, { name: id, authorityId: 'a', published: false, status: 'pending' });
    expect(parseBulkApproveRequest({ authorityId: 'a', ids }).ok).toBe(true);
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids });
    expect(out.updated).toHaveLength(499);
    expect(writes).toHaveLength(500);
  });
});

describe('parseBulkApproveRequest', () => {
  it('validates', () => {
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: ['x', 'x'] })).toEqual({ ok: true, value: { authorityId: 'a', ids: ['x'] } });
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: [] }).ok).toBe(false);
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: Array.from({ length: 500 }, (_, i) => `i${i}`) }).ok).toBe(false);
    expect(parseBulkApproveRequest({ authorityId: 'a/b', ids: ['x'] }).ok).toBe(false);
  });
});
