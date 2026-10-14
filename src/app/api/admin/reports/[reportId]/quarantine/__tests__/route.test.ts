import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { isContentRemoved } from '@/lib/moderation';

// POST /api/admin/reports/[reportId]/quarantine. Synthetic data only. Batches
// apply only on commit; commits are recorded so "one batch: target + audit",
// "403 → zero writes" and "report-update chunks are best-effort" are asserted.
type Op = { kind: 'update' | 'set'; path: string; data: Record<string, any> };

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  commits: [] as Op[][],
  reportReads: 0,
  failCommitNumber: 0, // 1-based index of the commit that should fail (0 = none)
  commitCalls: 0,
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

function makeDb(): any {
  const docRef = (path: string): any => ({
    path,
    get: async () => {
      if (path.startsWith('reports/')) state.reportReads++;
      return { exists: state.docs.has(path), data: () => state.docs.get(path) };
    },
  });
  const colRef = (path: string): any => ({
    doc: (id?: string) => docRef(`${path}/${id ?? `auto_${Math.random().toString(36).slice(2, 8)}`}`),
    where: (field: string, op: string, value: unknown) => ({
      get: async () => {
        const rows = Array.from(state.docs.entries()).filter(([k, v]) => k.startsWith(path + '/') && v[field] === value);
        return { docs: rows.map(([k, v]) => ({ id: k.split('/').pop(), ref: docRef(k), data: () => v })) };
      },
      limit: () => ({
        get: async () => {
          const rows = Array.from(state.docs.entries()).filter(
            ([k, v]) => k.startsWith(path + '/') && Array.isArray(v[field]) && v[field].includes(value),
          );
          return { empty: rows.length === 0, docs: rows.map(([k]) => ({ id: k.split('/').pop() })) };
        },
      }),
    }),
  });
  return {
    collection: (name: string) => colRef(name),
    batch: () => {
      const ops: Op[] = [];
      return {
        update: (r: any, data: any) => ops.push({ kind: 'update', path: r.path, data }),
        set: (r: any, data: any) => ops.push({ kind: 'set', path: r.path, data }),
        commit: async () => {
          state.commitCalls++;
          if (state.failCommitNumber === state.commitCalls) throw new Error('commit failed');
          state.commits.push(ops);
        },
      };
    },
  };
}

import { computeQuarantineTarget, POST } from '../route';

const mgrA = { uid: 'mgr_A', email: 'mgr@example.test' };

beforeEach(() => {
  state.docs = new Map();
  state.commits = [];
  state.reportReads = 0;
  state.failCommitNumber = 0;
  state.commitCalls = 0;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  const d = state.docs;
  d.set('authorities/auth_A', { managerIds: ['mgr_A'] });
  d.set('authorities/auth_B', { managerIds: ['mgr_B'] });
  d.set('community_groups/grp_A', { authorityId: 'auth_A', name: 'Secret Group Name', isActive: true });
  d.set('community_groups/grp_B', { authorityId: 'auth_B', isActive: true });
  d.set('community_groups/grp_gone', { authorityId: 'auth_A', isActive: false, moderationState: 'removed' });
  d.set('community_events/ev_A', { tenantId: 'auth_A', isActive: true });
  d.set('reports/r1', { targetType: 'group', targetId: 'grp_A', reporterId: 'reporter_uid', reason: 'harassment', status: 'pending' });
  d.set('reports/r2', { targetType: 'group', targetId: 'grp_A', reporterId: 'reporter_uid_2', status: 'pending' });
  d.set('reports/r_other_type', { targetType: 'event', targetId: 'grp_A', status: 'pending' }); // same id, different type: must NOT be touched
  d.set('reports/r_ev', { targetType: 'event', targetId: 'ev_A', status: 'pending' });
  d.set('reports/r_b', { targetType: 'group', targetId: 'grp_B', status: 'pending' });
  d.set('reports/r_removed', { targetType: 'group', targetId: 'grp_gone', status: 'pending' });
  d.set('reports/r_user', { targetType: 'user', targetId: 'grp_A', status: 'pending' });
});

describe('isContentRemoved', () => {
  it('true only for the explicit flag; legacy / admin-deactivated docs are unaffected', () => {
    expect(isContentRemoved({ moderationState: 'removed' })).toBe(true);
    expect(isContentRemoved({ isActive: false })).toBe(false);
    expect(isContentRemoved({})).toBe(false);
    expect(isContentRemoved(null)).toBe(false);
    expect(isContentRemoved(undefined)).toBe(false);
  });
});

describe('computeQuarantineTarget', () => {
  it('own authority → target quarantined + audit in ONE first batch; nothing hard-deleted', async () => {
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r1', '203.0.113.9');
    expect(r).toEqual({ status: 200, body: { ok: true, alreadyRemoved: false, reportsUpdated: 2, reportsFailed: 0 } });
    const first = state.commits[0];
    const upd = first.find((o) => o.kind === 'update')!;
    expect(upd.path).toBe('community_groups/grp_A');
    expect(upd.data).toMatchObject({ moderationState: 'removed', isActive: false, removedBy: 'mgr_A' });
    expect(upd.data.removedAt).toBeDefined();
    const audit = first.find((o) => o.kind === 'set')!;
    expect(audit.path.startsWith('audit_logs/')).toBe(true);
    expect(audit.data).toMatchObject({
      actionType: 'UPDATE', targetEntity: 'ContentQuarantine', targetId: 'grp_A', adminId: 'mgr_A', sourceIp: '203.0.113.9',
    });
    expect(audit.data.details).toContain('authority=auth_A');
    expect(audit.data.details).toContain('matchingReports=2');
    // No delete operations anywhere, and the group doc still exists.
    expect(state.commits.flat().some((o) => (o as any).kind === 'delete')).toBe(false);
    expect(state.docs.has('community_groups/grp_A')).toBe(true);
  });

  it('audit row carries no names, text or reporterId', async () => {
    await computeQuarantineTarget(makeDb(), mgrA, 'r1', 'ip');
    const audit = state.commits[0].find((o) => o.kind === 'set')!;
    const json = JSON.stringify(audit.data);
    for (const leak of ['Secret Group Name', 'reporter_uid', 'harassment']) expect(json).not.toContain(leak);
  });

  it('matching reports (same target AND same type) are set to actioned in a second step; others untouched', async () => {
    await computeQuarantineTarget(makeDb(), mgrA, 'r1', 'ip');
    const second = state.commits[1];
    expect(second.map((o) => o.path).sort()).toEqual(['reports/r1', 'reports/r2']);
    for (const o of second) expect(o.data.status).toBe('actioned');
  });

  it('event target (tenantId match) is quarantined too', async () => {
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r_ev', 'ip');
    expect(r.status).toBe(200);
    expect(state.commits[0].find((o) => o.kind === 'update')!.path).toBe('community_events/ev_A');
  });

  it('another authority\'s report → generic 403, ZERO writes', async () => {
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r_b', 'ip');
    expect(r.status).toBe(403);
    expect(state.commits.length).toBe(0);
  });

  it('missing report / user-type report / malformed id → the SAME 403', async () => {
    const results = await Promise.all(['r_nope', 'r_user', '../x'].map((id) => computeQuarantineTarget(makeDb(), mgrA, id, 'ip')));
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0].status).toBe(403);
    expect(state.commits.length).toBe(0);
  });

  it('unit_admin / unknown uid → 403 with ZERO report reads and zero writes', async () => {
    const r = await computeQuarantineTarget(makeDb(), { uid: 'unit_admin_uid', email: null }, 'r1', 'ip');
    expect(r.status).toBe(403);
    expect(state.reportReads).toBe(0);
    expect(state.commits.length).toBe(0);
  });

  it('idempotent: target already removed → 200 {alreadyRemoved:true}, no write, no second audit row', async () => {
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r_removed', 'ip');
    expect(r).toEqual({ status: 200, body: { ok: true, alreadyRemoved: true, reportsUpdated: 0, reportsFailed: 0 } });
    expect(state.commits.length).toBe(0);
  });

  it('root may quarantine any group/event target; root on a user/DM report → 403 (no target to remove)', async () => {
    const root = { uid: 'root', email: 'david@appout.co.il' };
    expect((await computeQuarantineTarget(makeDb(), root, 'r_b', 'ip')).status).toBe(200);
    expect((await computeQuarantineTarget(makeDb(), root, 'r_user', 'ip')).status).toBe(403);
  });

  it('first batch fails → throws (fail-closed): NOTHING applied, reports untouched', async () => {
    state.failCommitNumber = 1;
    await expect(computeQuarantineTarget(makeDb(), mgrA, 'r1', 'ip')).rejects.toThrow();
    expect(state.commits.length).toBe(0);
  });

  it('report-status step fails → quarantine STANDS, response says reportsFailed, log has the error name only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.failCommitNumber = 2;
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r1', 'ip');
    expect(r).toEqual({ status: 200, body: { ok: true, alreadyRemoved: false, reportsUpdated: 0, reportsFailed: 2 } });
    expect(state.commits.length).toBe(1); // the quarantine + audit batch only
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['grp_A', 'r1', 'mgr_A', 'Secret', 'reporter']) expect(logged).not.toContain(leak);
    spy.mockRestore();
  });

  it('>500 matching reports are updated in chunks of <= 500', async () => {
    for (let i = 0; i < 520; i++) state.docs.set(`reports/bulk${i}`, { targetType: 'group', targetId: 'grp_A', status: 'pending' });
    const r = await computeQuarantineTarget(makeDb(), mgrA, 'r1', 'ip');
    expect((r.body as any).reportsUpdated).toBe(522);
    const chunkSizes = state.commits.slice(1).map((c) => c.length);
    expect(chunkSizes.every((n) => n <= 500)).toBe(true);
    expect(chunkSizes.reduce((a, b) => a + b, 0)).toBe(522);
  });
});

function req(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers } as unknown as NextRequest;
}
const params = (reportId = 'r1') => ({ params: { reportId } });

describe('POST /api/admin/reports/[reportId]/quarantine', () => {
  it('no token → 401, nothing verified or read', async () => {
    const res = await POST(req(), params());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.reportReads).toBe(0);
  });

  it('revoked token → 401 (checkRevoked requested), no reads, no writes', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await POST(req('Bearer revoked'), params());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.reportReads).toBe(0);
    expect(state.commits.length).toBe(0);
  });

  it('own → 200 + no-store; other authority → 403; unit_admin → 403', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    const ok = await POST(req('Bearer ok'), params());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_B', email: null });
    expect((await POST(req('Bearer ok'), params('r1'))).status).toBe(403);
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: null });
    expect((await POST(req('Bearer ok'), params('r1'))).status).toBe(403);
  });

  it('rate-limited → 429 with Retry-After, no reads', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    state.blocked = true;
    const res = await POST(req('Bearer ok'), params());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.reportReads).toBe(0);
  });

  it('internal error (first batch fails) → 500, nothing applied, log has the error name only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.failCommitNumber = 1;
    const res = await POST(req('Bearer TOKEN_IN_HEADER'), params());
    expect(res.status).toBe(500);
    expect(state.commits.length).toBe(0);
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['mgr_A', 'secret-mail', 'TOKEN_IN_HEADER', 'r1', 'grp_A', 'Secret Group Name']) {
      expect(logged).not.toContain(leak);
    }
    spy.mockRestore();
  });
});
