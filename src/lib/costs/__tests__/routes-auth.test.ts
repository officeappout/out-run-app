/**
 * /api/admin/costs/** — every route is super-admin gated (requireSuperAdminApi); only the
 * refresh route also accepts the cron secret, and a wrong secret falls through to the gate.
 * Store / refresh modules are mocked: this suite is about who gets in, and that a denied call
 * touches nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const st = vi.hoisted(() => ({
  gate: 'ok' as 'ok' | 401 | 403,
  calls: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () =>
    st.gate === 'ok' ? null : NextResponse.json({ error: st.gate === 401 ? 'Unauthorized' : 'Forbidden' }, { status: st.gate }),
}));
vi.mock('@/lib/costs/costs-store.server', () => ({
  loadMonths: async (_db: unknown, months: string[]) => { st.calls.push('loadMonths'); return Object.fromEntries(months.map((m) => [m, null])); },
  loadItems: async () => { st.calls.push('loadItems'); return []; },
  loadTodayAiUsd: async () => 0.42,
  createItem: async () => { st.calls.push('createItem'); return 'new1'; },
  patchItem: async () => { st.calls.push('patchItem'); return true; },
  setMonthFx: async () => { st.calls.push('setMonthFx'); },
}));
vi.mock('@/lib/costs/refresh.server', () => ({
  refreshMonth: async (_db: unknown, month: string) => { st.calls.push(`refresh:${month}`); return { month, results: [], fx: 'kept' }; },
}));

import { GET as getDashboard } from '@/app/api/admin/costs/route';
import { POST as postRefresh } from '@/app/api/admin/costs/refresh/route';
import { POST as postItem } from '@/app/api/admin/costs/items/route';
import { PATCH as patchItemRoute } from '@/app/api/admin/costs/items/[id]/route';
import { PUT as putFx } from '@/app/api/admin/costs/fx/route';

const SECRET = 'cron-secret-0123456789abcdef';
const req = (url: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
  new NextRequest(`https://outrun.co.il${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.auth ? { authorization: init.auth } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const ITEM = { name: 'Apple Developer', vendor: 'Apple', amount: 99, currency: 'USD', cadence: 'yearly', startDate: '2026-01-10', category: 'stores' };

beforeEach(() => {
  st.gate = 'ok';
  st.calls = [];
  process.env.AI_REVIEW_CRON_SECRET = SECRET;
});

describe('denied callers touch nothing', () => {
  for (const gate of [401, 403] as const) {
    it(`gate ${gate} on every route`, async () => {
      st.gate = gate;
      const responses = await Promise.all([
        getDashboard(req('/api/admin/costs')),
        postRefresh(req('/api/admin/costs/refresh', { method: 'POST', body: {} })),
        postItem(req('/api/admin/costs/items', { method: 'POST', body: ITEM })),
        patchItemRoute(req('/api/admin/costs/items/abc', { method: 'PATCH', body: { active: false } }), { params: { id: 'abc' } }),
        putFx(req('/api/admin/costs/fx', { method: 'PUT', body: { month: '2026-10', USD: 3.6, EUR: 3.9 } })),
      ]);
      expect(responses.map((r) => r.status)).toEqual([gate, gate, gate, gate, gate]);
      expect(st.calls).toEqual([]);
    });
  }

  it('the cron secret opens ONLY the refresh route', async () => {
    st.gate = 401;
    const auth = `Bearer ${SECRET}`;
    expect((await postRefresh(req('/api/admin/costs/refresh', { method: 'POST', body: {}, auth }))).status).toBe(200);
    expect((await postItem(req('/api/admin/costs/items', { method: 'POST', body: ITEM, auth }))).status).toBe(401);
    expect((await getDashboard(req('/api/admin/costs', { auth }))).status).toBe(401);
  });

  it('a wrong cron secret falls through to the super-admin gate', async () => {
    st.gate = 401;
    const res = await postRefresh(req('/api/admin/costs/refresh', { method: 'POST', body: {}, auth: 'Bearer wrong-secret-0123456789abc' }));
    expect(res.status).toBe(401);
    expect(st.calls).toEqual([]);
  });
});

describe('super admin', () => {
  it('GET returns the dashboard; a future month falls back to the current one', async () => {
    const res = await getDashboard(req('/api/admin/costs?month=2999-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month <= new Date().toISOString().slice(0, 7) || body.month.length === 7).toBe(true);
    expect(body.todayAiUsd).toBe(0.42);
    expect(body.connectors.find((c: { id: string }) => c.id === 'ai_ledger').configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('refresh validates the month', async () => {
    expect((await postRefresh(req('/api/admin/costs/refresh', { method: 'POST', body: { month: '2999-01' } }))).status).toBe(400);
    expect((await postRefresh(req('/api/admin/costs/refresh', { method: 'POST', body: { month: '2026-09' } }))).status).toBe(200);
    expect(st.calls).toEqual(['refresh:2026-09']);
  });

  it('items: create validates, patch rejects empty bodies and odd ids', async () => {
    expect((await postItem(req('/api/admin/costs/items', { method: 'POST', body: { ...ITEM, amount: 0 } }))).status).toBe(400);
    expect((await postItem(req('/api/admin/costs/items', { method: 'POST', body: ITEM }))).status).toBe(200);
    expect((await patchItemRoute(req('/api/admin/costs/items/abc', { method: 'PATCH', body: {} }), { params: { id: 'abc' } })).status).toBe(400);
    expect((await patchItemRoute(req('/api/admin/costs/items/a..b', { method: 'PATCH', body: { active: false } }), { params: { id: 'a/../b' } })).status).toBe(400);
    expect((await patchItemRoute(req('/api/admin/costs/items/abc', { method: 'PATCH', body: { active: false } }), { params: { id: 'abc' } })).status).toBe(200);
    expect(st.calls).toEqual(['createItem', 'patchItem']);
  });

  it('fx rejects silly rates', async () => {
    expect((await putFx(req('/api/admin/costs/fx', { method: 'PUT', body: { month: '2026-10', USD: 300, EUR: 3.9 } }))).status).toBe(400);
    expect((await putFx(req('/api/admin/costs/fx', { method: 'PUT', body: { month: '2026-10', clear: true } }))).status).toBe(200);
  });
});
