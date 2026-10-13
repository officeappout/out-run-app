import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

// POST /api/admin/community-groups/delete. Synthetic data only. The fake Admin
// db records reads and defers every write into a batch that is applied only on
// commit, so "403 → zero writes" and "one batch, all-or-nothing" are asserted.
type Op =
  | { kind: 'delete'; path: string }
  | { kind: 'set'; path: string; data: Record<string, any>; opts?: unknown }
  | { kind: 'update'; path: string; data: Record<string, any> };

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  commits: [] as unknown[][],
  groupReads: 0,
  subReads: 0,
  blocked: false,
  verifyIdToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }),
  getAdminDb: () => makeDb(),
}));
vi.mock('@/lib/requestIp', () => ({ getRequestIp: () => '203.0.113.9' }));
vi.mock('@/lib/rateLimitLog', () => ({ logRateLimitBlock: vi.fn() }));
vi.mock('@/lib/rateLimitConfig', async (orig) => {
  const actual = await orig<typeof import('@/lib/rateLimitConfig')>();
  return {
    ...actual,
    isBlockedByAny: async () => (state.blocked ? { blocked: true, window: { windowMs: 60_000, maxRequests: 30 } } : { blocked: false }),
  };
});

function ref(path: string): any {
  const id = path.split('/').pop()!;
  return {
    path,
    id,
    get: async () => {
      if (path.startsWith('community_groups/') && path.split('/').length === 2) state.groupReads++;
      return { exists: state.docs.has(path), ref: ref(path), id, data: () => state.docs.get(path) };
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function collectionRef(path: string): any {
  return {
    doc: (id?: string) => ref(`${path}/${id ?? `auto_${state.docs.size}_${Math.random().toString(36).slice(2, 8)}`}`),
    get: async () => {
      if (path.includes('/')) state.subReads++;
      const depth = path.split('/').length + 1;
      const rows = Array.from(state.docs.keys()).filter((k) => k.startsWith(path + '/') && k.split('/').length === depth);
      return { size: rows.length, docs: rows.map((k) => ({ id: k.split('/').pop(), ref: ref(k), data: () => state.docs.get(k) })) };
    },
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: async () => {
          const rows = Array.from(state.docs.entries()).filter(
            ([k, v]) => k.startsWith(path + '/') && Array.isArray(v[field]) && v[field].includes(value),
          );
          return { empty: rows.length === 0, docs: rows.map(([k]) => ({ id: k.split('/').pop() })) };
        },
      }),
    }),
  };
}

function makeDb(): any {
  return {
    collection: (name: string) => collectionRef(name),
    getAll: async (...refs: any[]) =>
      refs.map((r) => ({ exists: state.docs.has(r.path), ref: r, id: r.id })),
    batch: () => {
      const ops: Op[] = [];
      return {
        delete: (r: any) => ops.push({ kind: 'delete', path: r.path }),
        set: (r: any, data: any, opts?: unknown) => ops.push({ kind: 'set', path: r.path, data, opts }),
        update: (r: any, data: any) => ops.push({ kind: 'update', path: r.path, data }),
        commit: async () => {
          state.commits.push(ops);
        },
      };
    },
  };
}

import { computeDeleteGroup, POST } from '../route';

const GROUP = 'grp_1';
const g = (p: string) => `community_groups/${GROUP}${p}`;

beforeEach(() => {
  state.docs = new Map();
  state.commits = [];
  state.groupReads = 0;
  state.subReads = 0;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  const d = state.docs;
  d.set('authorities/auth_A', { managerIds: ['mgr_A'] });
  d.set('authorities/auth_B', { managerIds: ['mgr_B'] });
  d.set(g(''), { name: 'secret group name', authorityId: 'auth_A' });
  d.set('community_groups_reserve/' + GROUP, { meetingLocation: 'x' });
  d.set(g('/members/m1'), { name: 'Member One' });
  d.set(g('/members/m2'), { name: 'Member Two' });
  d.set('users/m1', { core: { name: 'Member One' }, social: { groupIds: [GROUP] } });
  // users/m2 intentionally missing: its mirror must be skipped, not abort the batch.
  d.set('chats/group_' + GROUP, { type: 'group' });
  d.set('chats/group_' + GROUP + '/messages/x1', { text: 'PRIVATE MESSAGE TEXT', senderUid: 'm1' });
  d.set('chats/group_' + GROUP + '/messages/x2', { text: 'ANOTHER', senderUid: 'm2' });
  d.set(g('/private/invite'), { code: 'INVITECODE' });
  d.set(g('/attendance/a1'), {});
  d.set(g('/attendance/a1/member_statuses/s1'), {});
});

const mgrA = { uid: 'mgr_A', email: 'mgr@example.test' };

describe('computeDeleteGroup', () => {
  it('own authority manager → 200 with counts, ONE batch with every delete + both member mirrors + audit', async () => {
    const r = await computeDeleteGroup(makeDb(), mgrA, GROUP, '203.0.113.9');
    expect(r).toEqual({ status: 200, body: { ok: true, deleted: { members: 2, messages: 2 } } });
    expect(state.commits.length).toBe(1);
    const ops = state.commits[0] as Op[];
    const deleted = ops.filter((o) => o.kind === 'delete').map((o) => o.path).sort();
    expect(deleted).toEqual([
      g(''),
      g('/attendance/a1'),
      g('/attendance/a1/member_statuses/s1'),
      g('/members/m1'),
      g('/members/m2'),
      g('/private/invite'),
      'chats/group_' + GROUP,
      'chats/group_' + GROUP + '/messages/x1',
      'chats/group_' + GROUP + '/messages/x2',
      'community_groups_reserve/' + GROUP,
    ].sort());
    const arrayRemoveCtor = FieldValue.arrayRemove('x').constructor;
    // user_memberships mirror for BOTH members (merge set)…
    for (const uid of ['m1', 'm2']) {
      const op = ops.find((o) => o.kind === 'set' && o.path === `user_memberships/${uid}`) as Extract<Op, { kind: 'set' }>;
      expect(op).toBeTruthy();
      expect(op.data.groupIds).toBeInstanceOf(arrayRemoveCtor);
      expect(op.opts).toEqual({ merge: true });
    }
    // …and users.social.groupIds only where the user doc exists (m1), same batch.
    const userOps = ops.filter((o) => o.kind === 'update');
    expect(userOps.map((o) => o.path)).toEqual(['users/m1']);
    expect((userOps[0] as any).data['social.groupIds']).toBeInstanceOf(arrayRemoveCtor);
  });

  it('audit row: DELETE / CommunityGroup / <id>, counts only — no names, uids or message text anywhere in it', async () => {
    await computeDeleteGroup(makeDb(), mgrA, GROUP, '203.0.113.9');
    const ops = state.commits[0] as Op[];
    const audit = ops.find((o) => o.kind === 'set' && o.path.startsWith('audit_logs/')) as Extract<Op, { kind: 'set' }>;
    expect(audit.data.actionType).toBe('DELETE');
    expect(audit.data.targetEntity).toBe('CommunityGroup');
    expect(audit.data.targetId).toBe(GROUP);
    const json = JSON.stringify(audit.data);
    for (const leak of ['Member One', 'Member Two', 'PRIVATE MESSAGE TEXT', 'secret group name', 'INVITECODE', 'm1', 'm2']) {
      expect(json).not.toContain(leak);
    }
  });

  it('tenantId match also authorises (military/school tenants)', async () => {
    state.docs.set(g(''), { name: 'n', tenantId: 'auth_A' });
    const r = await computeDeleteGroup(makeDb(), mgrA, GROUP, 'ip');
    expect(r.status).toBe(200);
  });

  it('another authority\'s manager → generic 403, ZERO writes and ZERO member/chat reads; identical to not-found', async () => {
    const other = await computeDeleteGroup(makeDb(), { uid: 'mgr_B', email: null }, GROUP, 'ip');
    expect(other.status).toBe(403);
    expect(state.commits.length).toBe(0);
    expect(state.subReads).toBe(0);
    const missing = await computeDeleteGroup(makeDb(), { uid: 'mgr_B', email: null }, 'no_such_group', 'ip');
    expect(missing).toEqual(other);
  });

  it('unit_admin / unknown uid (in no managerIds) → 403, group never even read', async () => {
    const r = await computeDeleteGroup(makeDb(), { uid: 'unit_admin_uid', email: 'u@example.test' }, GROUP, 'ip');
    expect(r.status).toBe(403);
    expect(state.groupReads).toBe(0);
    expect(state.commits.length).toBe(0);
  });

  it('root deletes any group, and can clean up when the main doc is already gone', async () => {
    const root = { uid: 'root_uid', email: 'david@appout.co.il' };
    expect((await computeDeleteGroup(makeDb(), root, GROUP, 'ip')).status).toBe(200);
    state.docs.delete(g(''));
    expect((await computeDeleteGroup(makeDb(), root, GROUP, 'ip')).status).toBe(200);
  });

  it('bad groupId → 400 without touching the db', async () => {
    expect((await computeDeleteGroup(makeDb(), mgrA, '../x', 'ip')).status).toBe(400);
    expect((await computeDeleteGroup(makeDb(), mgrA, undefined, 'ip')).status).toBe(400);
    expect(state.commits.length).toBe(0);
  });

  it('over 500 ops → 409 and NOTHING is committed (no partial delete)', async () => {
    for (let i = 0; i < 520; i++) state.docs.set('chats/group_' + GROUP + `/messages/big${i}`, { text: 't' });
    const r = await computeDeleteGroup(makeDb(), mgrA, GROUP, 'ip');
    expect(r.status).toBe(409);
    expect(state.commits.length).toBe(0);
  });
});

function req(authorization?: string, body: unknown = { groupId: GROUP }): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers, json: async () => body } as unknown as NextRequest;
}

describe('POST /api/admin/community-groups/delete', () => {
  it('no token → 401 (nothing verified, nothing read or written)', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.commits.length).toBe(0);
  });

  it('revoked token → 401 with checkRevoked requested, no writes', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await POST(req('Bearer revoked'));
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.commits.length).toBe(0);
  });

  it('own manager → 200 {ok, deleted}', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    const res = await POST(req('Bearer ok'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: { members: 2, messages: 2 } });
  });

  it('another authority → 403; unit_admin → 403', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_B', email: null });
    expect((await POST(req('Bearer ok'))).status).toBe(403);
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: null });
    expect((await POST(req('Bearer ok'))).status).toBe(403);
    expect(state.commits.length).toBe(0);
  });

  it('rate-limited → 429 with Retry-After, no writes', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    state.blocked = true;
    const res = await POST(req('Bearer ok'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.commits.length).toBe(0);
  });

  it('internal error → 500 and the log carries no uid / email / groupId / header token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.docs = null as any;
    const res = await POST(req('Bearer TOKEN_IN_HEADER'));
    expect(res.status).toBe(500);
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['mgr_A', 'secret-mail', 'TOKEN_IN_HEADER', GROUP]) expect(logged).not.toContain(leak);
    spy.mockRestore();
  });
});
