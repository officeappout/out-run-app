import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/admin/reports/[reportId]/chat — reported-chat viewer (minors'
// content). Synthetic data only. The fake db counts message-collection reads so
// "403 → zero reads" is asserted, wraps dates in a Timestamp-shaped stand-in
// (axiom §31), and records audit rows so "every read is audited" is asserted.
const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  audits: [] as Array<Record<string, any>>,
  messageReads: 0,
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
  const docRef = (path: string): any => ({
    get: async () => ({ exists: state.docs.has(path), data: () => state.docs.get(path) }),
    collection: (sub: string) => colRef(`${path}/${sub}`),
  });
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
    orderBy: () => ({
      limit: (n: number) => ({
        get: async () => {
          state.messageReads++;
          const rows = Array.from(state.docs.entries())
            .filter(([k]) => k.startsWith(path + '/'))
            .sort((a, b) => b[1].sentAt.toDate().getTime() - a[1].sentAt.toDate().getTime())
            .slice(0, n);
          return { docs: rows.map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })) };
        },
      }),
    }),
  });
  return { collection: (name: string) => colRef(name) };
}

import { computeReportedChat, GET } from '../route';

const ts = (min: number) => new FakeTs(new Date(Date.UTC(2026, 9, 13, 10, min)));

beforeEach(() => {
  state.docs = new Map();
  state.audits = [];
  state.messageReads = 0;
  state.auditFails = false;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  const d = state.docs;
  d.set('authorities/auth_A', { managerIds: ['mgr_A'] });
  d.set('authorities/auth_B', { managerIds: ['mgr_B'] });
  d.set('community_groups/grp_1', { authorityId: 'auth_A' });
  d.set('reports/rep_group', { targetType: 'group', targetId: 'grp_1', reporterId: 'reporter_uid', reason: 'abuse' });
  d.set('reports/rep_user', { targetType: 'user', targetId: 'grp_1', reporterId: 'reporter_uid' });
  d.set('reports/rep_event', { targetType: 'event', targetId: 'grp_1' });
  for (let i = 0; i < 60; i++) {
    d.set(`chats/group_grp_1/messages/m${String(i).padStart(2, '0')}`, {
      text: `msg-${i}`, senderName: `Sender ${i % 3}`, senderUid: `uid_${i % 3}`, sentAt: ts(i), type: 'text',
      readBy: ['uid_0', 'uid_1'],
    });
  }
});

const mgrA = { uid: 'mgr_A', email: 'mgr@example.test' };

describe('computeReportedChat', () => {
  it('own authority → 50 most recent messages, chronological, ONLY id/senderName/text/sentAt/type', async () => {
    const r = await computeReportedChat(makeDb(), mgrA, 'rep_group', '203.0.113.9');
    expect(r.status).toBe(200);
    const msgs = (r.body as any).messages;
    expect(msgs.length).toBe(50);
    expect(msgs[0].text).toBe('msg-10');
    expect(msgs[49].text).toBe('msg-59');
    for (const m of msgs) {
      expect(Object.keys(m).sort()).toEqual(['id', 'senderName', 'sentAt', 'text', 'type']);
    }
    const json = JSON.stringify(r.body);
    for (const leak of ['senderUid', 'uid_0', 'uid_1', 'readBy', 'participants', 'reporter_uid']) {
      expect(json).not.toContain(leak);
    }
  });

  it('every successful read writes an audit row READ/ReportedChat/<reportId> with adminId, IP, count — and no content', async () => {
    await computeReportedChat(makeDb(), mgrA, 'rep_group', '203.0.113.9');
    expect(state.audits.length).toBe(1);
    const a = state.audits[0];
    expect(a.actionType).toBe('READ');
    expect(a.targetEntity).toBe('ReportedChat');
    expect(a.targetId).toBe('rep_group');
    expect(a.adminId).toBe('mgr_A');
    expect(a.sourceIp).toBe('203.0.113.9');
    expect(a.details).toContain('messages=50');
    const json = JSON.stringify(a);
    for (const leak of ['msg-', 'Sender', 'uid_0', 'grp_1', 'abuse']) expect(json).not.toContain(leak);
  });

  it('audit write fails → fails closed: no content returned', async () => {
    state.auditFails = true;
    await expect(computeReportedChat(makeDb(), mgrA, 'rep_group', 'ip')).rejects.toThrow();
  });

  it('another authority\'s manager → generic 403, ZERO message reads, no audit', async () => {
    const r = await computeReportedChat(makeDb(), { uid: 'mgr_B', email: null }, 'rep_group', 'ip');
    expect(r.status).toBe(403);
    expect(state.messageReads).toBe(0);
    expect(state.audits.length).toBe(0);
  });

  it('unit_admin / unknown uid → 403 before the report is even read', async () => {
    const r = await computeReportedChat(makeDb(), { uid: 'unit_admin_uid', email: null }, 'rep_group', 'ip');
    expect(r.status).toBe(403);
    expect(state.messageReads).toBe(0);
  });

  it('non-group reports (user / event) and a missing report → the SAME 403', async () => {
    const results = await Promise.all(
      ['rep_user', 'rep_event', 'rep_missing'].map((id) => computeReportedChat(makeDb(), mgrA, id, 'ip')),
    );
    for (const r of results) expect(r).toEqual({ status: 403, body: { error: expect.any(String) } });
    expect(results[0]).toEqual(results[2]);
    expect(state.messageReads).toBe(0);
  });

  it('report pointing at a missing group → 403 for a manager', async () => {
    state.docs.set('reports/rep_orphan', { targetType: 'group', targetId: 'ghost_group' });
    const r = await computeReportedChat(makeDb(), mgrA, 'rep_orphan', 'ip');
    expect(r.status).toBe(403);
    expect(state.messageReads).toBe(0);
  });

  it('the admin route STILL reads a chat that moderation has closed to members (Admin SDK path is unaffected by the quarantine flag)', async () => {
    state.docs.set('chats/group_grp_1', { type: 'group', moderationState: 'removed', lastMessage: 'התוכן הוסר' });
    const r = await computeReportedChat(makeDb(), mgrA, 'rep_group', 'ip');
    expect(r.status).toBe(200);
    expect((r.body as any).messages.length).toBe(50);
  });

  it('tenantId match authorises; root may read any group\'s reported chat', async () => {
    state.docs.set('community_groups/grp_1', { tenantId: 'auth_A' });
    expect((await computeReportedChat(makeDb(), mgrA, 'rep_group', 'ip')).status).toBe(200);
    state.docs.set('community_groups/grp_1', { authorityId: 'auth_B' });
    expect((await computeReportedChat(makeDb(), { uid: 'root', email: 'david@appout.co.il' }, 'rep_group', 'ip')).status).toBe(200);
  });

  it('malformed reportId → 403 without any read', async () => {
    const r = await computeReportedChat(makeDb(), mgrA, '../x', 'ip');
    expect(r.status).toBe(403);
    expect(state.messageReads).toBe(0);
  });
});

function req(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers } as unknown as NextRequest;
}
const params = (reportId = 'rep_group') => ({ params: { reportId } });

describe('GET /api/admin/reports/[reportId]/chat', () => {
  it('no token → 401, nothing verified or read', async () => {
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.messageReads).toBe(0);
  });

  it('revoked token → 401 (checkRevoked requested), nothing read or audited', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await GET(req('Bearer revoked'), params());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.messageReads).toBe(0);
    expect(state.audits.length).toBe(0);
  });

  it('own authority → 200 + no-store, one audit row', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    const res = await GET(req('Bearer ok'), params());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await res.json()).messages.length).toBe(50);
    expect(state.audits.length).toBe(1);
  });

  it('other authority → 403; unit_admin → 403; no content, no audit', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_B', email: null });
    expect((await GET(req('Bearer ok'), params())).status).toBe(403);
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: null });
    expect((await GET(req('Bearer ok'), params())).status).toBe(403);
    expect(state.messageReads).toBe(0);
    expect(state.audits.length).toBe(0);
  });

  it('rate-limited → 429 with Retry-After, no reads', async () => {
    state.verifyIdToken.mockResolvedValue(mgrA);
    state.blocked = true;
    const res = await GET(req('Bearer ok'), params());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.messageReads).toBe(0);
  });

  it('internal error → 500 and the log contains no uid / email / ids / message text / header token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.auditFails = true;
    const res = await GET(req('Bearer TOKEN_IN_HEADER'), params());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('msg-');
    const logged = JSON.stringify(spy.mock.calls);
    for (const leak of ['mgr_A', 'secret-mail', 'TOKEN_IN_HEADER', 'rep_group', 'grp_1', 'msg-', 'Sender']) {
      expect(logged).not.toContain(leak);
    }
    spy.mockRestore();
  });
});
