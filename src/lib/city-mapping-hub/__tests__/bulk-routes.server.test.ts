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

import { NATIONWIDE_APPROVE_DEFAULT_FILTER } from '../review-filters';
import { approvePendingRoutes, parseBulkApproveRequest, parseBulkRejectRequest, readPendingRoutesNationwide, rejectPendingRoutes } from '../bulk-routes.server';

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
  put('route_scores/r1', { score: 84, geometryGapM: 120, computedAt: new Date() });
  const p = (m: number) => [{ lat: 32, lng: 34.8 }, { lat: 32 + m / 111_195, lng: 34.8 }];
  for (const id of ['r2', 'r3', 'r7']) store.set(`official_routes/${id}`, { ...store.get(`official_routes/${id}`)!, path: p(300) });
  store.set('official_routes/r1', { ...store.get('official_routes/r1')!, path: p(50) });
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

describe('straight-bridge guard', () => {
  it('preview: stored gap ≥500 → gap; no stored gap → measured from path at 1000; no path / missing score → unmeasured', async () => {
    put('official_routes/g1', { name: 'g1', authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.0045, lng: 34.8 }] });
    put('route_scores/g1', { score: 80, geometryGapM: 500 });                                  // stored 500 → gap
    put('official_routes/g2', { name: 'g2', authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.0079, lng: 34.8 }] }); // ~878 m, no score doc → ok
    put('official_routes/g3', { name: 'g3', authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.0095, lng: 34.8 }] }); // ~1056 m → gap
    put('official_routes/g4', { name: 'g4', authorityId: 'a', published: false, status: 'pending' });                                                              // no path → unmeasured
    const r = await readPendingRoutesNationwide(db as never);
    const by = (id: string) => r.candidates.find((c) => c.id === id)!;
    expect(by('r1')).toMatchObject({ geometry: 'ok', gapM: 120 });
    expect(by('g1')).toMatchObject({ geometry: 'gap', gapM: 500 });
    expect(by('g2')).toMatchObject({ geometry: 'ok' });
    expect(by('g2').score).toBeNull();
    expect(by('g3').geometry).toBe('gap');
    expect(by('g4')).toMatchObject({ geometry: 'unmeasured', gapM: null });
  });
  it('POST re-checks: a gap / unmeasured id sent anyway is skipped, never written', async () => {
    put('official_routes/g1', { name: 'g1', authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.02, lng: 34.8 }] });
    put('official_routes/g4', { name: 'g4', authorityId: 'a', published: false, status: 'pending' });
    put('route_scores/g5', { geometryGapM: 499 });
    put('official_routes/g5', { name: 'g5', authorityId: 'a', published: false, status: 'pending' });
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'g1', 'g4', 'g5'] });
    expect(out.updated.sort()).toEqual(['g5', 'r1']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]))).toEqual({ g1: 'geometry_gap', g4: 'geometry_unmeasured' });
    expect(writes.filter((w) => w.op === 'update').map((w) => w.path).sort()).toEqual(['official_routes/g5', 'official_routes/r1']);
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
    for (const id of ids) put(`official_routes/${id}`, { name: id, authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.001, lng: 34.8 }] });
    expect(parseBulkApproveRequest({ authorityId: 'a', ids }).ok).toBe(true);
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids });
    expect(out.updated).toHaveLength(499);
    expect(writes).toHaveLength(500);
  });
});

describe('parseBulkApproveRequest', () => {
  it('validates', () => {
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: ['x', 'x'] })).toEqual({ ok: true, value: { authorityId: 'a', ids: ['x'], filter: NATIONWIDE_APPROVE_DEFAULT_FILTER } });
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: [] }).ok).toBe(false);
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: Array.from({ length: 500 }, (_, i) => `i${i}`) }).ok).toBe(false);
    expect(parseBulkApproveRequest({ authorityId: 'a/b', ids: ['x'] }).ok).toBe(false);
  });
});

describe('review filter — re-applied at write time (owner 24.10.2026)', () => {
  beforeEach(() => {
    put('authorities/a', { name: 'אילת', type: 'city' });
    put('route_scores/r2', { score: 58, lowConfidenceReason: 'low_score_fill', geometryGapM: 80 });
    put('route_scores/r3', { score: 66, geometryGapM: 80 });
  });
  it('preview carries low confidence, authority kind, city, activity', async () => {
    put('authorities/b', { name: 'חיפה', type: 'regional_council' });
    const r = await readPendingRoutesNationwide(db as never);
    const by = (id: string) => r.candidates.find((c) => c.id === id)!;
    expect(by('r2')).toMatchObject({ score: 58, lowConfidenceReason: 'low_score_fill', authorityKind: 'municipal' });
    expect(by('r1').lowConfidenceReason).toBeNull();
    expect(by('r7').authorityKind).toBe('regional');
    expect(by('r3').city).toBe('אילת');
  });
  it('approve: ids outside the confirmed filter are skipped as filter_mismatch, never written', async () => {
    const filter = { authorityKind: 'all' as const, scoreMin: 70, scoreMax: null, lowConfidence: 'exclude' as const };
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'r2', 'r3'], filter });
    expect(out.updated).toEqual(['r1']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]))).toEqual({ r2: 'filter_mismatch', r3: 'filter_mismatch' });
    expect(writes.filter((w) => w.op === 'update').map((w) => w.path)).toEqual(['official_routes/r1']);
  });
  it('approve: authority kind is read from the authority doc', async () => {
    const out = await approvePendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1'], filter: { authorityKind: 'regional', scoreMin: null, scoreMax: null, lowConfidence: 'any' } });
    expect(out.updated).toEqual([]);
    expect(writes).toHaveLength(0);
  });
  it('reject: archives only pending, own, matching routes — same fields as the single reject — one audit row', async () => {
    const filter = { authorityKind: 'municipal' as const, scoreMin: 55, scoreMax: 61, lowConfidence: 'only' as const };
    const out = await rejectPendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['r1', 'r2', 'r4', 'r7'], filter, reason: 'ציון נמוך' });
    expect(out.updated).toEqual(['r2']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]))).toEqual({ r1: 'filter_mismatch', r4: 'not_pending', r7: 'other_authority' });
    const upd = writes.filter((w) => w.op === 'update');
    expect(upd.map((w) => w.path)).toEqual(['official_routes/r2']);
    expect(upd[0].data).toMatchObject({ published: false, status: 'archived', rejectionReason: 'ציון נמוך', reviewedBy: 'admin-1', reviewedAt: TS, updatedAt: TS });
    const audit = writes.filter((w) => w.op === 'set');
    expect(audit).toHaveLength(1);
    expect(audit[0].data).toMatchObject({ actionType: 'REJECT', targetEntity: 'Route' });
  });
  it('reject ignores the straight-bridge guard (a bridged route can be rejected)', async () => {
    put('official_routes/g1', { name: 'g1', authorityId: 'a', published: false, status: 'pending' });
    const out = await rejectPendingRoutes(db as never, 'admin-1', { authorityId: 'a', ids: ['g1'], filter: { authorityKind: 'all', scoreMin: null, scoreMax: null, lowConfidence: 'any' }, reason: null });
    expect(out.updated).toEqual(['g1']);
  });
  it('request parsing: malformed filter is a 400, reject requires a filter', () => {
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: ['x'], filter: { scoreMin: 'high' } }).ok).toBe(false);
    expect(parseBulkApproveRequest({ authorityId: 'a', ids: ['x'], filter: { scoreMin: 70 } })).toMatchObject({ ok: true, value: { filter: { scoreMin: 70 } } });
    expect(parseBulkRejectRequest({ authorityId: 'a', ids: ['x'] }).ok).toBe(false);
    expect(parseBulkRejectRequest({ authorityId: 'a', ids: ['x'], filter: {}, reason: '  ' })).toMatchObject({ ok: true, value: { reason: null } });
  });
});

describe('no filter sent → server default ≥70, low confidence excluded', () => {
  it('a hub POST without a filter never approves a <70 or low-confidence route', async () => {
    put('route_scores/r2', { score: 58, lowConfidenceReason: 'low_score_fill', geometryGapM: 80 });
    put('route_scores/r3', { score: 85, lowConfidenceReason: 'low_score_fill', geometryGapM: 80 });
    put('official_routes/r8', { name: 'mid', authorityId: 'a', published: false, status: 'pending', path: [{ lat: 32, lng: 34.8 }, { lat: 32.001, lng: 34.8 }] });
    put('route_scores/r8', { score: 66, geometryGapM: 80 });
    const parsed = parseBulkApproveRequest({ authorityId: 'a', ids: ['r1', 'r2', 'r3', 'r8'] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.filter).toEqual(NATIONWIDE_APPROVE_DEFAULT_FILTER);
    const out = await approvePendingRoutes(db as never, 'admin-1', parsed.value);
    expect(out.updated).toEqual(['r1']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]))).toEqual({ r2: 'filter_mismatch', r3: 'filter_mismatch', r8: 'filter_mismatch' });
    expect(writes.filter((w) => w.op === 'update').map((w) => w.path)).toEqual(['official_routes/r1']);
  });
  it('an explicit filter replaces the default', () => {
    const p = parseBulkApproveRequest({ authorityId: 'a', ids: ['x'], filter: { scoreMin: 55, lowConfidence: 'any' } });
    expect(p).toMatchObject({ ok: true, value: { filter: { scoreMin: 55, lowConfidence: 'any' } } });
  });
});
