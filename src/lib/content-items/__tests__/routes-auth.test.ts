/**
 * /api/admin/content/** — super admin only (requireSuperAdminApi); a denied call touches nothing.
 * /api/content — public, published only, cached. /api/content/suggestions — signed-in users.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const st = vi.hoisted(() => ({
  gate: 'ok' as 'ok' | 401 | 403,
  calls: [] as string[],
  lastFilter: null as unknown,
  token: 'good' as string | null,
  flagOn: true,
  superAdmin: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ core: { isSuperAdmin: st.superAdmin } }) }) }) }) }),
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => { if (t !== 'good') throw new Error('bad'); return { uid: 'user_1' }; } }),
}));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () =>
    st.gate === 'ok' ? null : NextResponse.json({ error: st.gate === 401 ? 'Unauthorized' : 'Forbidden' }, { status: st.gate }),
  resolveAdminUid: async () => 'admin_uid',
}));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ enableUnifiedSearch: st.flagOn }) }));
vi.mock('@/lib/content-items/store.server', () => ({
  listContentItems: async (_db: unknown, f: unknown) => { st.calls.push('list'); st.lastFilter = f; return [{ id: 'help-a', type: 'help', q: 'q', a: ['a'], status: 'published', updatedBy: 'secret', seedHash: 'h' }]; },
  getContentItem: async () => { st.calls.push('get'); return null; },
  saveContentItem: async (_db: unknown, id: string, _i: unknown, uid: string) => { st.calls.push(`save:${id}:${uid}`); },
  setContentStatus: async () => { st.calls.push('status'); return true; },
  listContentSuggestions: async () => { st.calls.push('listSuggestions'); return []; },
  markSuggestionHandled: async () => { st.calls.push('markSuggestion'); },
  addContentSuggestion: async (_db: unknown, id: string) => { st.calls.push(`suggest:${id}`); return 'created'; },
}));

import { GET as adminList } from '@/app/api/admin/content/route';
import { GET as adminGet, PUT as adminPut, PATCH as adminPatch } from '@/app/api/admin/content/[id]/route';
import { GET as sugList, PATCH as sugPatch } from '@/app/api/admin/content/suggestions/route';
import { GET as publicGet } from '@/app/api/content/route';
import { POST as suggest } from '@/app/api/content/suggestions/route';

const req = (url: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
  new NextRequest(`https://outrun.co.il${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.auth ? { authorization: init.auth } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const ctx = { params: { id: 'faq-users-he-abc' } };
const QA = { type: 'faq', slug: 'abc', locale: 'he', audience: 'users', topic: 'users', tags: [], status: 'draft', order: 0, q: 'שאלה?', a: ['תשובה'] };

beforeEach(() => {
  st.gate = 'ok';
  st.calls = [];
  st.flagOn = true;
  st.superAdmin = false;
});

describe('admin content routes', () => {
  for (const gate of [401, 403] as const) {
    it(`gate ${gate}: every route denied, nothing read or written`, async () => {
      st.gate = gate;
      const res = await Promise.all([
        adminList(req('/api/admin/content')),
        adminGet(req('/api/admin/content/x'), ctx),
        adminPut(req('/api/admin/content/x', { method: 'PUT', body: QA }), ctx),
        adminPatch(req('/api/admin/content/x', { method: 'PATCH', body: { status: 'published' } }), ctx),
        sugList(req('/api/admin/content/suggestions')),
        sugPatch(req('/api/admin/content/suggestions', { method: 'PATCH', body: { id: 'a', handled: true } })),
      ]);
      expect(res.map((r) => r.status)).toEqual(Array(6).fill(gate));
      expect(st.calls).toEqual([]);
    });
  }
  it('super admin: save is validated and records the admin as updatedBy', async () => {
    expect((await adminPut(req('/api/admin/content/x', { method: 'PUT', body: { ...QA, a: [] } }), ctx)).status).toBe(400);
    expect((await adminPut(req('/api/admin/content/x', { method: 'PUT', body: QA }), ctx)).status).toBe(200);
    expect(st.calls).toEqual(['save:faq-users-he-abc:admin_uid']);
  });
  it('bad id / bad status → 400 before any write', async () => {
    expect((await adminPut(req('/api/admin/content/X', { method: 'PUT', body: QA }), { params: { id: '../users' } })).status).toBe(400);
    expect((await adminPatch(req('/api/admin/content/x', { method: 'PATCH', body: { status: 'live' } }), ctx)).status).toBe(400);
    expect(st.calls).toEqual([]);
  });
});

describe('public GET /api/content', () => {
  it('published only, no editor fields, edge-cached', async () => {
    const res = await publicGet(req('/api/content?type=help&locale=he'));
    expect(res.status).toBe(200);
    expect(st.lastFilter).toEqual({ status: 'published', type: 'help', locale: 'he' });
    const body = await res.json();
    expect(body.items[0].updatedBy).toBeUndefined();
    expect(body.items[0].seedHash).toBeUndefined();
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');
  });
  it('rejects unknown type / locale', async () => {
    expect((await publicGet(req('/api/content?type=users'))).status).toBe(400);
    expect((await publicGet(req('/api/content?locale=fr'))).status).toBe(400);
  });
});

describe('POST /api/content/suggestions', () => {
  it('needs a valid token', async () => {
    expect((await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'פרונט' } }))).status).toBe(401);
    expect((await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'פרונט' }, auth: 'Bearer bad' }))).status).toBe(401);
    expect(st.calls).toEqual([]);
  });
  it('flag on → stored once per user + query (id from the token uid)', async () => {
    const res = await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'פרונט ליבר', category: 'exercises' }, auth: 'Bearer good' }));
    expect(res.status).toBe(200);
    expect(st.calls[0]).toMatch(/^suggest:user_1_[0-9a-z]+$/);
  });
  it('flag off → 404 unless super admin', async () => {
    st.flagOn = false;
    expect((await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'פרונט' }, auth: 'Bearer good' }))).status).toBe(404);
    st.superAdmin = true;
    expect((await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'פרונט' }, auth: 'Bearer good' }))).status).toBe(200);
  });
  it('rejects junk', async () => {
    expect((await suggest(req('/api/content/suggestions', { method: 'POST', body: { query: 'x', extra: 1 }, auth: 'Bearer good' }))).status).toBe(400);
  });
});
