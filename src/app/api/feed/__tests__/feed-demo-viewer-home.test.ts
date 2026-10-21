/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * /api/feed home feed for the demo VIEWER (PR 5): the demo cities' posts join the viewer's
 * own feed (partners posts included, private never); a real caller's feed is untouched and
 * a real author's post never rides in on a demo city id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const home = async (uid: string, qs = '') =>
  (await (await GET(new NextRequest(`http://localhost/api/feed${qs}`, { headers: { authorization: `Bearer ${uid}` } }))).json()).posts.map((p: any) => p.id);

beforeEach(() => {
  __resetDemoWorldCachesForTests();
  st.db = makeFakeAdminDb({
    'demo_registry/viewers': { uids: ['viewerUid'] },
    'demo_registry/tenants': { cityIds: ['demo-tlv'], authorityIds: ['demo-tlv'], groupIds: [] },
    'authorities/demo-tlv': { name: 'דמו · תל אביב', isDemo: true },
    'connections/viewerUid': { following: ['realFriend'] },
    'connections/realUid': { following: ['realFriend'] },
    'feed_posts/r1': { authorUid: 'realFriend', audience: 'public', authorityId: 'sderot', createdAt: '2026-10-20T07:00:00Z' },
    'feed_posts/d1': { authorUid: 'demo_tlv01', audience: 'partners', authorityId: 'demo-tlv', ageGroup: 'demo', createdAt: '2026-10-20T09:00:00Z' },
    'feed_posts/d2': { authorUid: 'demo_tlv02', audience: 'private', authorityId: 'demo-tlv', ageGroup: 'demo', createdAt: '2026-10-20T08:00:00Z' },
    // a real post stamped with a demo city id (should never exist) is not pulled in
    'feed_posts/x1': { authorUid: 'stranger', audience: 'public', authorityId: 'demo-tlv', createdAt: '2026-10-20T10:00:00Z' },
  }).db;
});

describe('/api/feed — demo viewer home feed', () => {
  it('the viewer sees their follows + the demo city (partners yes, private no)', async () => {
    expect(await home('viewerUid')).toEqual(['d1', 'r1']);
  });
  it('a real caller sees exactly their follows', async () => {
    expect(await home('realUid')).toEqual(['r1']);
  });
  it("the viewer sees a demo author's partners posts on that profile", async () => {
    expect(await home('viewerUid', '?author=demo_tlv01')).toEqual(['d1']);
  });
});
