/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * /api/feed?author=<demo uid> (demo-users-design.md L2 + PR 2 viewer exception):
 * a real user who doesn't follow a demo profile sees nothing; the owner's
 * viewer accounts (demo_registry/viewers) and other demo users see it as
 * members of the demo world do.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

const st = vi.hoisted(() => ({ db: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }),
  getAdminDb: () => st.db,
}));

import { GET } from '../route';
import { __resetDemoWorldCachesForTests } from '@/lib/demo-world.server';

const get = async (uid: string) =>
  (await (await GET(new NextRequest('http://localhost/api/feed?author=demo_c01', { headers: { authorization: `Bearer ${uid}` } }))).json()).posts;

beforeEach(() => {
  __resetDemoWorldCachesForTests();
  st.db = makeFakeAdminDb({
    'demo_registry/viewers': { uids: ['viewerUid'] },
    'feed_posts/p1': { authorUid: 'demo_c01', audience: 'public', createdAt: '2026-10-20T08:00:00Z' },
  }).db;
});

describe('/api/feed?author=demo — viewer exception', () => {
  it('a real non-follower sees nothing', async () => {
    expect(await get('realUid')).toEqual([]);
  });
  it('a registered viewer sees the demo profile feed', async () => {
    expect((await get('viewerUid')).map((p: any) => p.id)).toEqual(['p1']);
  });
  it('another demo user sees it too', async () => {
    expect((await get('demo_c02')).map((p: any) => p.id)).toEqual(['p1']);
  });
});
