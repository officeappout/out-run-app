import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/admin/reports/[reportId]/dismiss. Synthetic data only. Writes are
// deferred into a batch applied only on commit, so "403 → zero writes", "one
// batch with the audit row" and fail-closed are asserted.
type Op = { kind: 'update' | 'set'; path: string; data: Record<string, any> };

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  commits: [] as unknown[][],
  reportReads: 0,
  commitFails: false,
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
  });
  return {
    collection: (name: string) => colRef(name),
    batch: () => {
      const ops: Op[] = [];
      return {
        update: (r: any, data: any) => ops.push({ kind: 'update', path: r.path, data }),
        set: (r: any, data: any) => ops.push({ kind: 'set', path: r.path, data }),
        commit: async () => {
          if (state.commitFails) throw new Error('commit failed');
          state.commits.push(ops);
        },
      };
    },
  };
}

import { computeDismissReport, POST } from '../route';

const mgrA = { uid: 'mgr_A', email: 'mgr@example.test' };

beforeEach(() => {
  state.docs = new Map();
  state.commits = [];
  state.reportReads = 0;
  state.commitFails = false;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  const d = state.docs;
  d.set('authorities/auth_A', { managerIds: ['mgr_A'] });
  d.set('authorities/auth_B', { managerIds: ['mgr_B'] });
  d.set('community_groups/grp_A', { authorityId: 'auth_A' });
  d.set('community_groups/grp_B', { authorityId: 'auth_B' });
  d.set('community_events/ev_A', { tenantId: 'auth_A' });
  d.set('reports/r_own', { targetType: 'group', targetId: 'grp_A', targetName: 'Group A', reporterId: 'reporter_uid', reason: 'harassment', status: 'pending' });
  d.set('reports/r_own_event', { targetType: 'event', targetId: 'ev_A', status: 'pending' });
  d.set('reports/r_other', { targetType: 'group', targetId: 'grp_B', status: 'pending' });
  d.set('reports/r_user', { targetType: 'user', targetId: 'grp_A', status: 'pending' });
  d.set('reports/r_ghost', { targetType: 'group', targetId: 'ghost', status: 'pending' });
  d.set('reports/r_done', { targetType: 'group', targetId: 'grp_A', status: 'dismissed' });
});

describe('computeDismissReport', () => {
  it('own authority → 200; ONE batch: status update + audit row (UPDATE/ReportDismiss/<id>: adminId, IP, authority)', async () => {
    const r = await computeDismissReport(makeDb(), mgrA, 'r_own', '203.0.113.9');
    expect(r).toEqual({ status: 200, body: { ok: true, alreadyDismissed: false } });
    expect(state.commits.length).toBe(1);
    const ops = state.commits[0] as Op[];
    const upd = ops.find((o) => o.kind === 'update')!;
    expect(upd.path).toBe('reports/r_own');
    expect(upd.data.status).toBe('dismissed');
    expect(upd.data.reviewedAt).toBeDefined();
    const audit = ops.find((o) => o.kind === 'set')!;
    expect(audit.path.startsWith('audit_logs/')).toBe(true);
    expect(audit.data).toMatchObject({
      actionType: 'UPDATE', targetEntity: 'ReportDismiss', targetId: 'r_own', adminId: 'mgr_A', sourceIp: '203.0.113.9',
    });
    expect(audit.data.details).toContain('authority=auth_A');
    const json = JSON.stringify(audit.data);
    for (const leak of ['Group A', 'grp_A', 'reporter_uid', 'harassment']) expect(json).not.toContain(leak);
  });

  it('event target (tenantId match) also authorised', async () => {
    expect((await computeDismissReport(makeDb(), mgrA, 'r_own_event', 'ip')).status).toBe(200);
  });

  it('another authority\'s report → generic 403, ZERO writes, no audit', async () => {
    const r = await computeDismissReport(makeDb(), mgrA, 'r_other', 'ip');
    expect(r.status).toBe(403);
    expect(state.commits.length).toBe(0);
  });

  it('re-verifies server-side: user-type report, missing target, missing report, malformed id → the SAME 403 body', async () => {
    const results = await Promise.all(
      ['r_user', 'r_ghost', 'r_missing', '../x'].map((id) => computeDismissReport(makeDb(), mgrA, id, 'ip')),
    );
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0].status).toBe(403);
    expect(state.commits.length).toBe(0);
  });

  it('unit_admin / unknown uid → 403 with ZERO report reads and zero writes', async () => {
    const r = await computeDismissReport(makeDb(), { uid: 'unit_admin_uid', email: null }, 'r_own', 'ip');
    expect(r.status).toBe(403);
    expect(state.reportReads).toBe(0);
    expect(state.commits.length).toBe(0);
  });

  it('idempotent: already-dismissed → 200 {alreadyDismissed:true}, no write, no audit row', async () => {
    const r = await computeDismissReport(makeDb(), mgrA, 'r_done', 'ip');
    expect(r).toEqual({ status: 200, body: { ok: true, alreadyDismissed: true } });
    expect(state.commits.length).toBe(0);
  });

  it('root dismisses any existing report, audit authority=root', async () => {
    const r = await computeDismissReport(makeDb(), { uid: 'root', email: 'david@appout.co.il' }, 'r_other', 'ip');
    expect(r.status).toBe(200);
    const audit = (state.commits[0] as Op[]).find((o) => o.kind === 'set')!;
    expect(audit.data.details).toContain('authority=root');
  });

  it('commit failure → throws (fail-closed: nothing applied, no success returned)', async () => {
    state.commitFails = true;
    await expect(computeDismissReport(makeDb(), mgrA, 'r_own', 'ip')).rejects.toThrow();
    expect(state.commits.length).toBe(0);
  });
});

function req(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers } as unknown as NextRequest;
}
const params = (reportId = 'r_own') => ({ params: { reportId } });

describe('POST /api/admin/reports/[reportId]/dismiss', () => {
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
    expect((await POST(req('Bearer ok'), params('r_own'))).status).toBe(403);
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: null });
    expect((await POST(req('Bearer ok'), params('r_own'))).status).toBe(403);
    expect(state.commits.length).toBe(1); // only the legitimate one
  });

  it('rate-limited → 429 with Retry-After, no reads', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    state.blocked = true;
    const res = await POST(req('Bearer ok'), params());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.reportReads).toBe(0);
  });

  it('internal error (commit fails) → 500, nothing applied, log has the error name only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.commitFails = true;
    const res = await POST(req('Bearer TOKEN_IN_HEADER'), params());
    expect(res.status).toBe(500);
    expect(state.commits.length).toBe(0);
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['mgr_A', 'secret-mail', 'TOKEN_IN_HEADER', 'r_own', 'grp_A', 'Group A', 'reporter_uid']) {
      expect(logged).not.toContain(leak);
    }
    spy.mockRestore();
  });
});
