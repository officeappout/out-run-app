import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/admin/reports — scoped list. Synthetic data only. Dates are wrapped
// in a Timestamp-shaped stand-in (axiom §31); reads of `reports` are counted so
// "403 → zero reads" is asserted; audit rows are recorded.
const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  audits: [] as Array<Record<string, any>>,
  reportReads: 0,
  auditFails: false,
  blocked: false,
  verifyIdToken: vi.fn(),
}));

class FakeTs {
  constructor(private d: Date) {}
  toDate() { return this.d; }
}

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
  const docRef = (path: string): any => ({ path });
  const colRef = (path: string): any => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    add: async (data: Record<string, any>) => {
      if (state.auditFails) throw new Error('audit write failed');
      state.audits.push(data);
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
    orderBy: () => {
      const make = (after: string | null): any => ({
        limit: (n: number) => ({
          startAfter: (cursorDoc: any) => make(cursorDoc.id).limit(n),
          get: async () => {
            state.reportReads++;
            const rows = Array.from(state.docs.entries())
              .filter(([k]) => k.startsWith(path + '/'))
              .sort((a, b) => b[1].createdAt.toDate().getTime() - a[1].createdAt.toDate().getTime());
            const startIdx = after ? rows.findIndex(([k]) => k.endsWith('/' + after)) + 1 : 0;
            const slice = rows.slice(startIdx, startIdx + n);
            return { docs: slice.map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })) };
          },
        }),
      });
      return make(null);
    },
  });
  return {
    collection: (name: string) => colRef(name),
    getAll: async (...refs: any[]) =>
      refs.map((r) => ({ exists: state.docs.has(r.path), data: () => state.docs.get(r.path) })),
  };
}

import { computeListReports, GET } from '../route';

const t = (min: number) => new FakeTs(new Date(Date.UTC(2026, 9, 13, 0, 0) + min * 60_000));
const mgrA = { uid: 'mgr_A', email: 'mgr@example.test' };

function addReport(id: string, over: Record<string, any>) {
  state.docs.set(`reports/${id}`, {
    targetType: 'group', targetId: 'grp_A', targetName: 'Group A', reporterId: 'reporter_uid_1',
    reason: 'harassment', status: 'pending', createdAt: t(100), ...over,
  });
}

beforeEach(() => {
  state.docs = new Map();
  state.audits = [];
  state.reportReads = 0;
  state.auditFails = false;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  const d = state.docs;
  d.set('authorities/auth_A', { managerIds: ['mgr_A'] });
  d.set('authorities/auth_B', { managerIds: ['mgr_B'] });
  d.set('community_groups/grp_A', { authorityId: 'auth_A' });
  d.set('community_groups/grp_T', { tenantId: 'auth_A' });
  d.set('community_groups/grp_B', { authorityId: 'auth_B' });
  d.set('community_events/ev_A', { authorityId: 'auth_A' });
  addReport('r_own_group', { createdAt: t(50) });
  addReport('r_own_tenant', { targetId: 'grp_T', createdAt: t(40) });
  addReport('r_own_event', { targetType: 'event', targetId: 'ev_A', createdAt: t(30) });
  addReport('r_other', { targetId: 'grp_B', createdAt: t(60) });
  addReport('r_user', { targetType: 'user', targetId: 'grp_A', createdAt: t(70) });
  addReport('r_missing_target', { targetId: 'ghost', createdAt: t(80) });
  addReport('r_freetext', { targetId: 'grp_A', reason: 'Jane Doe from class 7 said a bad thing', createdAt: t(20) });
});

describe('computeListReports', () => {
  it('own authority → only reports whose TARGET (group authorityId / tenantId / event) is theirs, newest first', async () => {
    const r = await computeListReports(makeDb(), mgrA, '203.0.113.9');
    expect(r.status).toBe(200);
    const ids = (r.body as any).reports.map((x: any) => x.id);
    expect(ids).toEqual(['r_own_group', 'r_own_tenant', 'r_own_event', 'r_freetext']);
    expect(ids).not.toContain('r_other');
    expect(ids).not.toContain('r_user');
    expect(ids).not.toContain('r_missing_target');
  });

  it('response is a strict whitelist: no reporterId, no raw reason; category is a fixed key only', async () => {
    const r = await computeListReports(makeDb(), mgrA, 'ip');
    const reports = (r.body as any).reports;
    for (const x of reports) {
      expect(Object.keys(x).sort()).toEqual(['category', 'createdAt', 'id', 'reviewedAt', 'status', 'targetId', 'targetName', 'targetType']);
    }
    const json = JSON.stringify(r.body);
    for (const leak of ['reporter_uid_1', 'reporterId', 'reason', 'Jane Doe', 'class 7']) expect(json).not.toContain(leak);
    expect(reports.find((x: any) => x.id === 'r_own_group').category).toBe('harassment');
    expect(reports.find((x: any) => x.id === 'r_freetext').category).toBe('other'); // free text never passes through
    expect(typeof reports[0].createdAt).toBe('string');
  });

  it('another authority\'s manager sees only their own, never auth_A\'s', async () => {
    const r = await computeListReports(makeDb(), { uid: 'mgr_B', email: null }, 'ip');
    expect((r.body as any).reports.map((x: any) => x.id)).toEqual(['r_other']);
  });

  it('unit_admin / unknown uid → generic 403 with ZERO report reads and no audit', async () => {
    const r = await computeListReports(makeDb(), { uid: 'unit_admin_uid', email: null }, 'ip');
    expect(r.status).toBe(403);
    expect(state.reportReads).toBe(0);
    expect(state.audits.length).toBe(0);
  });

  it('root sees every report incl. user-type, still without reporterId/reason', async () => {
    const r = await computeListReports(makeDb(), { uid: 'root', email: 'office@appout.co.il' }, 'ip');
    const ids = (r.body as any).reports.map((x: any) => x.id);
    expect(ids).toContain('r_user');
    expect(ids).toContain('r_other');
    expect(JSON.stringify(r.body)).not.toContain('reporter_uid_1');
  });

  it('a report on a QUARANTINED target reads as actioned even if its own status update lagged', async () => {
    state.docs.set('community_groups/grp_A', { authorityId: 'auth_A', moderationState: 'removed', isActive: false });
    const r = await computeListReports(makeDb(), mgrA, 'ip');
    const rep = (r.body as any).reports.find((x: any) => x.id === 'r_own_group');
    expect(rep.status).toBe('actioned');
  });

  it('every call writes a READ/ReportsList audit row with counts only', async () => {
    await computeListReports(makeDb(), mgrA, '203.0.113.9');
    expect(state.audits.length).toBe(1);
    const a = state.audits[0];
    expect(a).toMatchObject({ actionType: 'READ', targetEntity: 'ReportsList', targetId: 'auth_A', adminId: 'mgr_A', sourceIp: '203.0.113.9' });
    expect(a.details).toContain('returned=4');
    const json = JSON.stringify(a);
    for (const leak of ['Group A', 'grp_A', 'reporter_uid_1', 'Jane']) expect(json).not.toContain(leak);
  });

  it('audit failure is BEST-EFFORT: the list is still returned, the failure is logged by error name only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.auditFails = true;
    const r = await computeListReports(makeDb(), mgrA, 'ip');
    expect(r.status).toBe(200);
    expect((r.body as any).reports.length).toBe(4);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('audit write failed');
    for (const leak of ['mgr_A', 'grp_A', 'Group A', 'audit_logs']) expect(logged).not.toContain(leak);
    spy.mockRestore();
  });

  it('pagination: own report older than the first page is still found', async () => {
    for (let i = 0; i < 250; i++) addReport(`noise_${i}`, { targetId: 'grp_B', createdAt: t(1000 + i) });
    const r = await computeListReports(makeDb(), mgrA, 'ip');
    expect((r.body as any).reports.map((x: any) => x.id)).toContain('r_own_group');
    expect((r.body as any).truncated).toBe(false);
    expect(state.reportReads).toBeGreaterThan(1);
  });

  it('bounded scan: 1100 other-authority reports newer than yours → truncated:true, never an unbounded read', async () => {
    for (let i = 0; i < 1100; i++) addReport(`noise_${i}`, { targetId: 'grp_B', createdAt: t(1000 + i) });
    const r = await computeListReports(makeDb(), mgrA, 'ip');
    expect((r.body as any).truncated).toBe(true);
    expect(state.reportReads).toBeLessThanOrEqual(5);
  });
});

function req(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers } as unknown as NextRequest;
}

describe('GET /api/admin/reports', () => {
  it('no token → 401, nothing verified or read', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.reportReads).toBe(0);
  });

  it('revoked token → 401 (checkRevoked requested), nothing read or audited', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await GET(req('Bearer revoked'));
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.reportReads).toBe(0);
    expect(state.audits.length).toBe(0);
  });

  it('own manager → 200 + no-store; unit_admin → 403 with no reads', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    const ok = await GET(req('Bearer ok'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect((await ok.json()).reports.length).toBe(4);
    state.reportReads = 0;
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: null });
    expect((await GET(req('Bearer ok'))).status).toBe(403);
    expect(state.reportReads).toBe(0);
  });

  it('rate-limited → 429 with Retry-After, no reads', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    state.blocked = true;
    const res = await GET(req('Bearer ok'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.reportReads).toBe(0);
  });

  it('internal error → 500 and the log carries no uid / email / report data / header token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.docs = null as any; // force a throw inside the compute path
    const res = await GET(req('Bearer TOKEN_IN_HEADER'));
    expect(res.status).toBe(500);
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['mgr_A', 'secret-mail', 'TOKEN_IN_HEADER', 'Group A', 'grp_A', 'reporter_uid_1']) {
      expect(logged).not.toContain(leak);
    }
    spy.mockRestore();
  });
});
