/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * /api/leagues/feed-board — auth, validation, the verified caller as "me", bounded `since`,
 * the 60 s shared scan cache. Ranking parity with the old client code lives in
 * src/features/arena/services/__tests__/feed-board-parity.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

const st = vi.hoisted(() => ({ db: null as any, reads: [] as string[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => { if (t === 'bad') throw new Error('x'); return { uid: t }; } }),
  getAdminDb: () => st.db,
}));

import { GET, parseFeedBoardRequest } from '../route';
import { __resetFeedBoardCacheForTests } from '../admin-reader';

const NOW = new Date('2026-10-21T12:00:00Z');
const since = new Date('2026-10-19T00:00:00Z').toISOString();
const call = (qs: string, token: string | null = 'me') =>
  GET(new NextRequest(`http://localhost/api/leagues/feed-board?${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => {
  __resetFeedBoardCacheForTests();
  const fake = makeFakeAdminDb({
    'feed_posts/a': { authorUid: 'me', authorName: 'Me', ageGroup: 'adult', activityCredit: 5, createdAt: new Date('2026-10-20T08:00:00Z') },
    'feed_posts/b': { authorUid: 'u2', authorName: 'U2', ageGroup: 'adult', activityCredit: 9, createdAt: new Date('2026-10-20T09:00:00Z') },
  });
  st.db = fake.db;
  st.reads = fake.reads;
});

describe('/api/leagues/feed-board', () => {
  it('401 without / with a bad token', async () => {
    expect((await call('kind=credit', null)).status).toBe(401);
    expect((await call('kind=credit', 'bad')).status).toBe(401);
  });
  it('400 on a bad kind, a missing / future / too-old window, bad maxEntries, missing ids', async () => {
    expect((await call('kind=nope')).status).toBe(400);
    expect((await call('kind=credit&ageGroup=adult')).status).toBe(400);
    expect((await call(`kind=credit&ageGroup=adult&since=${new Date('2026-10-22T00:00:00Z').toISOString()}`)).status).toBe(400);
    expect((await call(`kind=credit&ageGroup=adult&since=${new Date('2026-08-01T00:00:00Z').toISOString()}`)).status).toBe(400);
    expect((await call(`kind=credit&ageGroup=adult&since=${since}&maxEntries=500`)).status).toBe(400);
    expect((await call(`kind=credit&since=${since}`)).status).toBe(400);
    expect((await call(`kind=league&since=${since}`)).status).toBe(400);
    expect((await call('kind=segment')).status).toBe(400);
  });
  it('the verified caller is "me" — a currentUid param cannot impersonate', async () => {
    const body = await (await call(`kind=credit&scope=global&ageGroup=adult&timeWindow=weekly&since=${since}&currentUid=u2`, 'me')).json();
    expect(body.entries.map((e: any) => [e.uid, e.isCurrentUser])).toEqual([['u2', false], ['me', true]]);
    expect(body.myEntry.uid).toBe('me');
  });
  it('one scan is shared by callers of the same board for 60 s', async () => {
    const qs = `kind=credit&scope=global&ageGroup=adult&timeWindow=weekly&since=${since}`;
    await call(qs, 'me');
    await call(qs, 'u2');
    expect(st.reads.filter((r) => r.startsWith('feed_posts?'))).toHaveLength(1);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    await call(qs, 'me');
    expect(st.reads.filter((r) => r.startsWith('feed_posts?'))).toHaveLength(2);
    vi.setSystemTime(NOW);
  });
  it('parse keeps only known values', () => {
    const r = parseFeedBoardRequest(new URLSearchParams(`kind=credit&since=${since}&scope=evil&ageGroup=adult`), NOW.getTime());
    expect(typeof r).toBe('object');
    expect((r as any).scope).toBeUndefined();
  });
});
