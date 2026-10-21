/**
 * /api/admin/demo/feedback/** — every route is super-admin gated; a denied call touches
 * nothing; bad input is rejected before any read/write. The server module is mocked: this
 * suite is about who gets in and what reaches it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const st = vi.hoisted(() => ({
  gate: 'ok' as 'ok' | 401 | 403,
  calls: [] as string[],
  found: true,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/api-auth', () => ({
  requireSuperAdminApi: async () =>
    st.gate === 'ok' ? null : NextResponse.json({ error: st.gate === 401 ? 'Unauthorized' : 'Forbidden' }, { status: st.gate }),
  resolveAdminUid: async () => 'admin1',
}));
vi.mock('@/lib/demo-control/feedback.server', () => ({
  loadFeedbackPage: async (_db: unknown, f: { source: string }, cursor: { ms: number } | null) => {
    st.calls.push(`load:${f.source}:${cursor?.ms ?? '-'}`);
    return { items: [], nextCursor: null };
  },
  setFeedbackStatus: async (_db: unknown, uid: string, source: string, id: string, status: string) => {
    st.calls.push(`status:${uid}:${source}:${id}:${status}`);
    return st.found;
  },
  signFindingScreenshot: async (_db: unknown, id: string) => {
    st.calls.push(`sign:${id}`);
    return { ok: true, url: 'https://signed.example/x' };
  },
  signDesignScreenshot: async (_db: unknown, screen: string) => {
    st.calls.push(`sign-screen:${screen}`);
    return { ok: true, url: 'https://signed.example/s' };
  },
}));

import { GET as getFeedback } from '@/app/api/admin/demo/feedback/route';
import { POST as postStatus } from '@/app/api/admin/demo/feedback/status/route';
import { GET as getScreenshot } from '@/app/api/admin/demo/feedback/screenshot/route';
import { encodeCursor } from '@/lib/demo-control/feedback-query';

const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://outrun.co.il${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

beforeEach(() => {
  st.gate = 'ok';
  st.calls = [];
  st.found = true;
});

describe('denied callers touch nothing', () => {
  for (const gate of [401, 403] as const) {
    it(`gate ${gate} on every route`, async () => {
      st.gate = gate;
      const responses = await Promise.all([
        getFeedback(req('/api/admin/demo/feedback?source=all')),
        postStatus(req('/api/admin/demo/feedback/status', { method: 'POST', body: { source: 'testers', id: 'r1__a', status: 'handled' } })),
        getScreenshot(req('/api/admin/demo/feedback/screenshot?id=r1__a')),
        getScreenshot(req('/api/admin/demo/feedback/screenshot?screen=home_strength')),
      ]);
      expect(responses.map((r) => r.status)).toEqual([gate, gate, gate, gate]);
      expect(st.calls).toEqual([]);
    });
  }
});

describe('GET /feedback', () => {
  it('passes parsed filters and the decoded cursor', async () => {
    const res = await getFeedback(req(`/api/admin/demo/feedback?source=testers&cursor=${encodeCursor({ ms: 42, skip: [] })}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    expect(st.calls).toEqual(['load:testers:42']);
  });
  it('a broken cursor is a 400, not a fresh first page', async () => {
    const res = await getFeedback(req('/api/admin/demo/feedback?cursor=%%%'));
    expect(res.status).toBe(400);
    expect(st.calls).toEqual([]);
  });
});

describe('POST /feedback/status', () => {
  it('writes with the admin uid', async () => {
    const res = await postStatus(req('/api/admin/demo/feedback/status', { method: 'POST', body: { source: 'life', id: 'park_w1', status: 'irrelevant' } }));
    expect(res.status).toBe(200);
    expect(st.calls).toEqual(['status:admin1:life:park_w1:irrelevant']);
  });
  it('rejects bad bodies before writing', async () => {
    for (const body of [{ source: 'users', id: 'x', status: 'open' }, { source: 'life', id: 'a/b', status: 'open' }, { source: 'life', id: 'a', status: 'gone' }]) {
      expect((await postStatus(req('/api/admin/demo/feedback/status', { method: 'POST', body }))).status).toBe(400);
    }
    expect(st.calls).toEqual([]);
  });
  it('404 when the doc is gone', async () => {
    st.found = false;
    const res = await postStatus(req('/api/admin/demo/feedback/status', { method: 'POST', body: { source: 'testers', id: 'r1__a', status: 'handled' } }));
    expect(res.status).toBe(404);
  });
});

describe('GET /feedback/screenshot', () => {
  it('signs by finding id', async () => {
    const res = await getScreenshot(req('/api/admin/demo/feedback/screenshot?id=r1__a'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://signed.example/x' });
    expect(st.calls).toEqual(['sign:r1__a']);
  });
  it('rejects a path-like id', async () => {
    expect((await getScreenshot(req('/api/admin/demo/feedback/screenshot?id=../users'))).status).toBe(400);
    expect((await getScreenshot(req('/api/admin/demo/feedback/screenshot'))).status).toBe(400);
    expect(st.calls).toEqual([]);
  });
  it('signs a design screen by its summary key (the path comes from the summary doc)', async () => {
    const res = await getScreenshot(req(`/api/admin/demo/feedback/screenshot?screen=${encodeURIComponent('/parks/[id]')}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://signed.example/s' });
    expect(st.calls).toEqual(['sign-screen:/parks/[id]']);
  });
  it('rejects a bad screen key, or id + screen together', async () => {
    expect((await getScreenshot(req('/api/admin/demo/feedback/screenshot?screen=a%20b'))).status).toBe(400);
    expect((await getScreenshot(req(`/api/admin/demo/feedback/screenshot?screen=${'x'.repeat(121)}`))).status).toBe(400);
    expect((await getScreenshot(req('/api/admin/demo/feedback/screenshot?id=bad/..&screen=home'))).status).toBe(400);
    expect(st.calls).toEqual([]);
  });
});
