import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/admin/invitations — scoped list for the authority team page.
// Synthetic data only. The fake db counts invitation-collection reads so
// "403 → zero reads" is asserted, not assumed, and wraps dates in a
// Timestamp-shaped stand-in (.toDate present, .getTime absent) per axiom §31.
const state = vi.hoisted(() => ({
  authorities: [] as Array<{ id: string; data: Record<string, unknown> }>,
  invitations: [] as Array<{ id: string; data: Record<string, unknown> }>,
  invitationReads: 0,
  authorityReads: 0,
  blocked: false,
  verifyIdToken: vi.fn(),
}));

class FakeTs {
  constructor(private d: Date) {}
  toDate() { return this.d; }
  toMillis() { return this.d.getTime(); }
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

function snap(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  return { empty: rows.length === 0, docs: rows.map((r) => ({ id: r.id, data: () => r.data })) };
}

function makeDb(): any {
  return {
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => {
        const run = () => {
          if (name === 'authorities') {
            state.authorityReads++;
            const rows = state.authorities.filter((a) => {
              const v = a.data[field];
              if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
              return v === value;
            });
            return snap(rows);
          }
          state.invitationReads++;
          const rows = state.invitations.filter((i) => {
            const v = i.data[field];
            if (op === 'in') return (value as unknown[]).includes(v);
            return v === value;
          });
          return snap(rows);
        };
        return { limit: () => ({ get: async () => run() }), get: async () => run() };
      },
    }),
  };
}

import { computeListInvitations, GET } from '../route';

const NOW = new Date('2026-10-13T12:00:00Z');
const future = new FakeTs(new Date('2026-10-20T12:00:00Z'));
const past = new FakeTs(new Date('2026-10-01T12:00:00Z'));
const created = (day: number) => new FakeTs(new Date(`2026-10-${String(day).padStart(2, '0')}T08:00:00Z`));

beforeEach(() => {
  state.invitationReads = 0;
  state.authorityReads = 0;
  state.blocked = false;
  state.verifyIdToken.mockReset();
  state.authorities = [
    { id: 'auth_A', data: { managerIds: ['mgr_A'] } },
    { id: 'auth_A_child', data: { parentAuthorityId: 'auth_A', managerIds: [] } },
    { id: 'auth_B', data: { managerIds: ['mgr_B'] } },
  ];
  state.invitations = [
    { id: 'inv_live', data: { email: 'live@example.test', name: 'Live Person', role: 'authority_manager', authorityId: 'auth_A', token: 'TOKEN_LIVE', isUsed: false, expiresAt: future, createdAt: created(10), createdBy: 'root_uid' } },
    { id: 'inv_expired', data: { email: 'old@example.test', role: 'authority_manager', authorityId: 'auth_A', token: 'TOKEN_EXPIRED', isUsed: false, expiresAt: past, createdAt: created(2), createdBy: 'root_uid' } },
    { id: 'inv_used', data: { email: 'used@example.test', role: 'authority_manager', authorityId: 'auth_A_child', token: 'TOKEN_USED', isUsed: true, usedBy: 'someone_uid', expiresAt: future, createdAt: created(5), usedAt: created(6), createdBy: 'root_uid' } },
    { id: 'inv_tenant', data: { email: 'tenant@example.test', role: 'unit_admin', tenantId: 'auth_A', unitId: 'u1', token: 'TOKEN_TENANT', isUsed: false, expiresAt: future, createdAt: created(12), createdBy: 'owner_uid' } },
    { id: 'inv_other', data: { email: 'other@example.test', role: 'authority_manager', authorityId: 'auth_B', token: 'TOKEN_OTHER', isUsed: false, expiresAt: future, createdAt: created(11), createdBy: 'root_uid' } },
  ];
});

describe('computeListInvitations', () => {
  it('own authority manager → own + child + tenantId invitations, newest first, never another authority\'s', async () => {
    const r = await computeListInvitations(makeDb(), { uid: 'mgr_A', email: 'mgr@example.test' }, null, NOW);
    expect(r.status).toBe(200);
    const ids = (r.body as any).invitations.map((i: any) => i.id);
    expect(ids).toEqual(['inv_tenant', 'inv_live', 'inv_used', 'inv_expired']);
    expect(ids).not.toContain('inv_other');
  });

  it('token only on unused + unexpired rows; no creator/consumer uid leaves the route', async () => {
    const r = await computeListInvitations(makeDb(), { uid: 'mgr_A', email: null }, null, NOW);
    const byId = Object.fromEntries((r.body as any).invitations.map((i: any) => [i.id, i]));
    expect(byId.inv_live.token).toBe('TOKEN_LIVE');
    expect(byId.inv_tenant.token).toBe('TOKEN_TENANT');
    expect(byId.inv_expired.token).toBe('');
    expect(byId.inv_used.token).toBe('');
    const json = JSON.stringify(r.body);
    expect(json).not.toContain('root_uid');
    expect(json).not.toContain('owner_uid');
    expect(json).not.toContain('someone_uid');
    expect(typeof byId.inv_live.expiresAt).toBe('string'); // Timestamp-shaped input serialised
  });

  it('a manager of ANOTHER authority sees only their own, and a client-supplied authorityId is ignored for non-root', async () => {
    const r = await computeListInvitations(makeDb(), { uid: 'mgr_B', email: 'b@example.test' }, 'auth_A', NOW);
    expect(r.status).toBe(200);
    expect((r.body as any).invitations.map((i: any) => i.id)).toEqual(['inv_other']);
  });

  it('unit_admin / unknown uid (not in any managerIds) → generic 403 with ZERO invitation reads', async () => {
    const r = await computeListInvitations(makeDb(), { uid: 'unit_admin_uid', email: 'u@example.test' }, 'auth_A', NOW);
    expect(r.status).toBe(403);
    expect(state.invitationReads).toBe(0);
    expect(JSON.stringify(r.body)).not.toContain('auth_A');
  });

  it('root: authorityId required; with it, scoped to that authority', async () => {
    const none = await computeListInvitations(makeDb(), { uid: 'root', email: 'david@appout.co.il' }, null, NOW);
    expect(none.status).toBe(400);
    const r = await computeListInvitations(makeDb(), { uid: 'root', email: 'david@appout.co.il' }, 'auth_B', NOW);
    expect(r.status).toBe(200);
    expect((r.body as any).invitations.map((i: any) => i.id)).toEqual(['inv_other']);
  });
});

function req(authorization?: string, url = 'https://x.test/api/admin/invitations'): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return { headers, nextUrl: new URL(url) } as unknown as NextRequest;
}

describe('GET /api/admin/invitations', () => {
  it('no Authorization header → 401, no db reads', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
    expect(state.invitationReads + state.authorityReads).toBe(0);
  });

  it('revoked / bad token → 401, checkRevoked requested, no db reads', async () => {
    state.verifyIdToken.mockRejectedValue(new Error('auth/id-token-revoked'));
    const res = await GET(req('Bearer revoked'));
    expect(res.status).toBe(401);
    expect(state.verifyIdToken).toHaveBeenCalledWith('revoked', true);
    expect(state.invitationReads + state.authorityReads).toBe(0);
  });

  it('own manager → 200 with their invitations', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'mgr@example.test' });
    const res = await GET(req('Bearer ok'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await res.json()).invitations.length).toBe(4);
  });

  it('unit_admin → 403', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: 'unit_admin_uid', email: 'u@example.test' });
    const res = await GET(req('Bearer ok'));
    expect(res.status).toBe(403);
    expect(state.invitationReads).toBe(0);
  });

  it('rate-limited → 429 with Retry-After and no reads', async () => {
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: null });
    state.blocked = true;
    const res = await GET(req('Bearer ok'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(state.invitationReads + state.authorityReads).toBe(0);
  });

  it('internal error → 500 and the log line carries no uid/email/token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.verifyIdToken.mockResolvedValue({ uid: 'mgr_A', email: 'secret-mail@example.test' });
    state.authorities = null as any; // force a throw inside the compute path
    const res = await GET(req('Bearer TOKEN_IN_HEADER'));
    expect(res.status).toBe(500);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('mgr_A');
    expect(logged).not.toContain('secret-mail');
    expect(logged).not.toContain('TOKEN_IN_HEADER');
    spy.mockRestore();
  });
});
