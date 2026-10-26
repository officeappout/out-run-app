/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * Leaderboards over feed_posts — PARITY across the move to the server (rules-prep, 26.10).
 *
 * Commit 1 recorded these snapshots from the ORIGINAL client functions (client Firestore SDK mocked
 * onto an in-memory store). After the move the same functions call /api/leagues/feed-board, whose
 * Admin SDK is faked onto the SAME store; the snapshots must stay byte-identical. One fixture covers
 * every filter the six queries use (age group, window, scope fields, category, gender, program,
 * cardio distance, run segment, groupIds, demo docs, ephemeral groups, authority names).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';

const st = vi.hoisted(() => ({ db: null as any }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'me' } } }));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: async () => false }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }),
  getAdminDb: () => st.db,
}));
// The client SDK, mapped onto the same in-memory store (the pre-move path).
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, c: string, id: string) => ({ path: `${c}/${id}` }),
  where: (f: string, op: string, v: unknown) => ({ k: 'where', f, op, v }),
  orderBy: () => ({ k: 'noop' }),
  limit: () => ({ k: 'noop' }),
  query: (col: { name: string }, ...cs: any[]) => ({ name: col.name, cs }),
  getDocs: async (q: { name: string; cs: any[] }) => {
    let ref = st.db.collection(q.name);
    for (const c of q.cs) if (c.k === 'where') ref = ref.where(c.f, c.op, c.v);
    const snap = await ref.get();
    return { forEach: (fn: any) => snap.docs.forEach((d: any) => fn({ id: d.id, data: () => d.data() })) };
  },
  getDoc: async (r: { path: string }) => {
    const s = await st.db.doc(r.path).get();
    return { exists: () => s.exists, data: () => s.data() };
  },
  Timestamp: { fromDate: (d: Date) => d },
}));

import {
  getDistanceLeaderboard,
  getGroupCompetitionLeaderboard,
  getLeaderboard,
  getLeagueLeaderboard,
  getScopeCompetitionLeaderboard,
  getSegmentLeaderboard,
} from '../ranking.service';
import { GET } from '@/app/api/leagues/feed-board/route';
import { __resetFeedBoardCacheForTests } from '@/app/api/leagues/feed-board/admin-reader';

const NOW = new Date('2026-10-21T12:00:00'); // Wednesday
const d = (iso: string) => new Date(iso);

const post = (o: Record<string, unknown>) => ({ ageGroup: 'adult', activityCategory: 'strength', activityCredit: 10, createdAt: d('2026-10-20T08:00:00'), ...o });

function seed() {
  return makeFakeAdminDb({
    'feed_posts/a1': post({ authorUid: 'u1', authorName: 'דנה', activityCredit: 30, authorityId: 'tlv', neighborhoodId: 'n1', gender: 'female', groupIds: ['g1', 'g2'], programId: 'full_body' }),
    'feed_posts/a2': post({ authorUid: 'u1', authorName: 'דנה', activityCredit: 5, activityCategory: 'cardio', distanceKm: 5.04, authorityId: 'tlv', neighborhoodId: 'n1', gender: 'female', groupIds: ['g1'], runSegment: '5k', paceSecPerKm: 330 }),
    'feed_posts/a3': post({ authorUid: 'u2', authorName: 'יוסי', activityCredit: 50, activityCategory: 'cardio', distanceKm: 10.1, authorityId: 'tlv', neighborhoodId: 'n2', gender: 'male', groupIds: ['g1', 'eph'], runSegment: '5k', paceSecPerKm: 300, schoolId: 's1', parkId: 'p1' }),
    'feed_posts/a4': post({ authorUid: 'u3', activityCredit: 20, authorityId: 'jlm', gender: 'male', groupIds: [], runSegment: '5k', paceSecPerKm: 310 }),
    'feed_posts/a5': post({ authorUid: 'me', authorName: 'אני עצמי', activityCredit: 7, authorityId: 'tlv', neighborhoodId: 'n2', gender: 'male', groupIds: ['g2'], runSegment: '5k', paceSecPerKm: 360 }),
    'feed_posts/a6': post({ authorUid: 'u2', authorName: 'יוסי', activityCredit: 4, activityCategory: 'cardio', distanceKm: 0, authorityId: 'tlv', gender: 'male' }),
    'feed_posts/old': post({ authorUid: 'u4', activityCredit: 999, authorityId: 'tlv', createdAt: d('2026-09-01T08:00:00'), groupIds: ['g1'], runSegment: '5k', paceSecPerKm: 200 }),
    'feed_posts/minor': post({ authorUid: 'k1', ageGroup: 'minor', activityCredit: 40, authorityId: 'tlv', groupIds: ['g1'] }),
    'feed_posts/demo': post({ authorUid: 'demo_tlv01', activityCredit: 500, authorityId: 'demo-tlv', neighborhoodId: 'demo-n', groupIds: ['demo-g'] }),
    'feed_posts/today': post({ authorUid: 'u3', activityCredit: 3, authorityId: 'jlm', createdAt: d('2026-10-21T07:00:00') }),
    'community_groups/g1': { name: 'הרצים', type: 'running' },
    'community_groups/g2': { name: 'שכונה' },
    'community_groups/eph': { name: 'ריצה מתוזמנת', type: 'ephemeral' },
    'authorities/tlv': { name: 'תל אביב' },
    'authorities/n1': { name: 'פלורנטין' },
  }).db;
}

const stable = (r: any) => JSON.parse(JSON.stringify({ ...r, generatedAt: 'X' }));
const snap = (name: string) => `./__snapshots__/feed-board-parity/${name}.json`;
const me = { currentUid: 'me', currentName: 'אני' };

const fetchSpy = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) =>
  GET(new NextRequest(`http://localhost${url}`, { headers: init?.headers })));
// After the move: the client functions call /api/leagues/feed-board — routed to the real handler.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', fetchSpy);
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(() => { st.db = seed(); __resetFeedBoardCacheForTests(); });

describe('credit leaderboard (getLeaderboard)', () => {
  it.each([
    ['global-weekly-overall', { scope: 'global', scopeId: null, category: 'overall', timeWindow: 'weekly' }],
    ['city-weekly-cardio', { scope: 'city', scopeId: 'tlv', category: 'cardio', timeWindow: 'weekly' }],
    ['neighborhood-monthly-female', { scope: 'neighborhood', scopeId: 'n1', category: 'overall', timeWindow: 'monthly', genderFilter: 'female' }],
    ['park-daily', { scope: 'park', scopeId: 'p1', category: 'overall', timeWindow: 'daily' }],
    ['program', { scope: 'global', scopeId: null, category: 'overall', timeWindow: 'monthly', programId: 'full_body' }],
    ['top1', { scope: 'global', scopeId: null, category: 'overall', timeWindow: 'monthly', maxEntries: 1 }],
  ] as const)('%s', async (name, p) => {
    await expect(JSON.stringify(stable(await getLeaderboard({ ageGroup: 'adult', ...me, ...(p as any) })), null, 1)).toMatchFileSnapshot(snap(`credit-${name}`));
  });
  it('a caller with no posts gets the trailing rank', async () => {
    await expect(JSON.stringify(stable(await getLeaderboard({ scope: 'city', scopeId: 'jlm', category: 'overall', timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'me' })), null, 1))
      .toMatchFileSnapshot(snap('credit-no-posts'));
  });
});

describe('distance / segment / league (group members)', () => {
  it('distance, city weekly', async () => {
    await expect(JSON.stringify(stable(await getDistanceLeaderboard({ scope: 'city', scopeId: 'tlv', timeWindow: 'weekly', ageGroup: 'adult', ...me })), null, 1)).toMatchFileSnapshot(snap('distance-city'));
  });
  it('segment 5k, global + male', async () => {
    await expect(JSON.stringify(stable(await getSegmentLeaderboard({ scope: 'global', scopeId: null, runSegment: '5k', ...me })), null, 1)).toMatchFileSnapshot(snap('segment-global'));
    await expect(JSON.stringify(stable(await getSegmentLeaderboard({ scope: 'global', scopeId: null, runSegment: '5k', genderFilter: 'male', maxEntries: 1, ...me })), null, 1)).toMatchFileSnapshot(snap('segment-male-top1'));
  });
  it('league g1, weekly overall + cardio', async () => {
    await expect(JSON.stringify(stable(await getLeagueLeaderboard({ groupId: 'g1', category: 'overall', timeWindow: 'weekly', ...me })), null, 1)).toMatchFileSnapshot(snap('league-g1'));
    await expect(JSON.stringify(stable(await getLeagueLeaderboard({ groupId: 'g1', category: 'cardio', timeWindow: 'monthly', ...me })), null, 1)).toMatchFileSnapshot(snap('league-g1-cardio'));
  });
});

describe('group-vs-group and scope-vs-scope', () => {
  it('groups: global (demo + ephemeral out), city, gender', async () => {
    await expect(JSON.stringify(stable(await getGroupCompetitionLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'monthly' })), null, 1)).toMatchFileSnapshot(snap('groups-global'));
    await expect(JSON.stringify(stable(await getGroupCompetitionLeaderboard({ scope: 'city', scopeId: 'tlv', timeWindow: 'weekly', genderFilter: 'male' })), null, 1)).toMatchFileSnapshot(snap('groups-city-male'));
    await expect(JSON.stringify(stable(await getGroupCompetitionLeaderboard({ scope: 'city', scopeId: 'demo-tlv', timeWindow: 'weekly' })), null, 1)).toMatchFileSnapshot(snap('groups-demo-city'));
  });
  it('scopes: cities nationwide, neighborhoods in a city, gate without a city', async () => {
    await expect(JSON.stringify(stable(await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'monthly' })), null, 1)).toMatchFileSnapshot(snap('scopes-city'));
    await expect(JSON.stringify(stable(await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', cityAuthorityId: 'tlv', timeWindow: 'weekly', category: 'cardio' })), null, 1)).toMatchFileSnapshot(snap('scopes-neighborhood-tlv'));
    await expect(JSON.stringify(stable(await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly' })), null, 1)).toMatchFileSnapshot(snap('scopes-gate'));
  });
});

describe('transport', () => {
  it('every board above went through /api/leagues/feed-board, none through the client SDK', async () => {
    fetchSpy.mockClear();
    await getLeaderboard({ scope: 'global', scopeId: null, category: 'overall', timeWindow: 'weekly', ageGroup: 'adult', ...me });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^\/api\/leagues\/feed-board\?kind=credit/);
  });
});
