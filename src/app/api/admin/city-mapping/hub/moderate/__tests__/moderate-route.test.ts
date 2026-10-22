import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/** POST /api/admin/city-mapping/hub/moderate — synthetic data only, nothing real is written. */
const SERVER_TS = vi.hoisted(() => Symbol('serverTimestamp'));
const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ op: string; path: string; data: Record<string, unknown> }>,
  commits: 0,
  denied: null as null | number,
  uid: 'admin-1' as string | null,
  flagOn: true,
  failCommit: false,
  autoId: 0,
}));

function makeDb() {
  const ref = (path: string) => ({ path, id: path.split('/').pop()! });
  return {
    collection: (c: string) => ({ doc: (id?: string) => ref(`${c}/${id ?? `auto${++state.autoId}`}`) }),
    getAll: async (...refs: Array<{ path: string; id: string }>) => refs.map((r) => ({ id: r.id, exists: state.store.has(r.path), data: () => state.store.get(r.path) })),
    batch: () => {
      const ops: Array<{ op: string; path: string; data: Record<string, unknown> }> = [];
      return {
        update: (r: { path: string }, data: Record<string, unknown>) => { ops.push({ op: 'update', path: r.path, data }); },
        set: (r: { path: string }, data: Record<string, unknown>) => { ops.push({ op: 'set', path: r.path, data }); },
        commit: async () => { if (state.failCommit) throw new Error('boom'); state.commits++; state.writes.push(...ops); },
      };
    },
  };
}
// users/{uid} read for the audit name
const withUsers = (db: ReturnType<typeof makeDb>) => ({
  ...db,
  collection: (c: string) => c === 'users'
    ? { doc: (id: string) => ({ get: async () => ({ data: () => ({ core: { name: 'דוד' } }) }), path: `users/${id}`, id }) }
    : db.collection(c),
});

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => SERVER_TS } }));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () => (state.denied ? NextResponse.json({ error: 'x' }, { status: state.denied }) : null),
  resolveAdminUid: async () => state.uid,
}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => withUsers(makeDb()) }));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ enableCityMappingHub: state.flagOn }) }));

import { POST } from '../route';

const req = (body: unknown) => new NextRequest('http://localhost/api/admin/city-mapping/hub/moderate', { method: 'POST', body: JSON.stringify(body) });
const loc = { lat: 31.5, lng: 34.6 };

beforeEach(() => {
  state.store.clear(); state.writes = []; state.commits = 0; state.denied = null; state.uid = 'admin-1'; state.flagOn = true; state.failCommit = false;
  state.store.set('osm_amenities/a1', { authorityId: 'sderot', status: 'pending', location: loc });
  state.store.set('osm_amenities/a2', { authorityId: 'sderot', status: 'pending', location: loc });
  state.store.set('osm_amenities/a3', { authorityId: 'ashkelon', status: 'pending', location: loc });
  state.store.set('osm_amenities/a4', { authorityId: 'sderot', status: 'published', location: loc });
});

describe('POST /api/admin/city-mapping/hub/moderate', () => {
  it.each([401, 403])('guard %i first — nothing written', async (s) => {
    state.denied = s;
    expect((await POST(req({}))).status).toBe(s);
    expect(state.commits).toBe(0);
  });
  it('agent key (no person) cannot moderate', async () => {
    state.uid = null;
    expect((await POST(req({ authorityId: 'sderot', action: 'approve', ids: ['a1'] }))).status).toBe(403);
  });
  it('flag off ⇒ 403, nothing written', async () => {
    state.flagOn = false;
    expect((await POST(req({ authorityId: 'sderot', action: 'approve', ids: ['a1'] }))).status).toBe(403);
    expect(state.commits).toBe(0);
  });
  it.each([
    [{ authorityId: 'a/b', action: 'approve', ids: ['a1'] }],
    [{ authorityId: 'sderot', action: 'delete', ids: ['a1'] }],
    [{ authorityId: 'sderot', action: 'approve', ids: [] }],
    [{ authorityId: 'sderot', action: 'approve', ids: Array.from({ length: 501 }, (_, i) => `x${i}`) }],
    [{ authorityId: 'sderot', action: 'approve', ids: ['a/1'] }],
  ])('400 for a bad body', async (body) => {
    expect((await POST(req(body))).status).toBe(400);
  });
  it('approve: only pending items of THIS authority, one batch, moderation.service payload + one audit row', async () => {
    const res = await POST(req({ authorityId: 'sderot', action: 'approve', ids: ['a1', 'a2', 'a3', 'a4', 'ghost'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toEqual(['a1', 'a2']);
    expect(body.skipped).toEqual([{ id: 'a3', reason: 'other_authority' }, { id: 'a4', reason: 'not_pending' }, { id: 'ghost', reason: 'not_found' }]);
    expect(state.commits).toBe(1);
    const updates = state.writes.filter((w) => w.op === 'update');
    expect(updates.map((w) => w.path)).toEqual(['osm_amenities/a1', 'osm_amenities/a2']);
    // moderation.service.ts approveEntity('amenity'): exactly these keys.
    expect(updates[0].data).toEqual({ status: 'published', reviewedBy: 'admin-1', reviewedAt: SERVER_TS, updatedAt: SERVER_TS });
    const audit = state.writes.filter((w) => w.path.startsWith('audit_logs/'));
    expect(audit).toHaveLength(1);
    expect(audit[0].data).toMatchObject({ adminId: 'admin-1', adminName: 'דוד', actionType: 'APPROVE', targetEntity: 'Amenity', targetId: 'sderot' });
  });
  it('reject: rejectEntity(amenity) payload with the reason', async () => {
    await POST(req({ authorityId: 'sderot', action: 'reject', ids: ['a1'], reason: 'כפול' }));
    expect(state.writes[0].data).toEqual({ status: 'rejected', rejectionReason: 'כפול', reviewedBy: 'admin-1', reviewedAt: SERVER_TS, updatedAt: SERVER_TS });
    expect(state.writes[1].data).toMatchObject({ actionType: 'REJECT', targetId: 'a1' });
  });
  it('nothing eligible ⇒ no commit at all', async () => {
    const body = await (await POST(req({ authorityId: 'sderot', action: 'approve', ids: ['a3'] }))).json();
    expect(body.updated).toEqual([]);
    expect(state.commits).toBe(0);
  });
  it('a failed commit is a 500 that says nothing was written', async () => {
    state.failCommit = true;
    const res = await POST(req({ authorityId: 'sderot', action: 'approve', ids: ['a1'] }));
    expect(res.status).toBe(500);
    expect(state.writes).toEqual([]);
  });
});
