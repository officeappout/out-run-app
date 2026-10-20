/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * Demo world on the league boards (demo-users-design.md PR 2):
 *   - scope-stats: a real caller never sees a demo city; a demo user or a
 *     registered viewer does ("as if members"); a board with no demo scope
 *     never reads demo_registry.
 *   - individual-board: a demo city's board ranks the 'demo' cohort for the
 *     demo world; a real caller gets an empty board; real boards unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';
import { periodKeysFor } from '@/features/arena/services/league-scope-keys';

const st = vi.hoisted(() => ({ db: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  // The bearer token IS the uid in these tests.
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }),
  getAdminDb: () => st.db,
}));

import { GET as scopeStats } from '../scope-stats/route';
import { GET as individualBoard } from '../individual-board/route';
import { __resetDemoWorldCachesForTests } from '@/lib/demo-world.server';

const req = (path: string, uid: string) =>
  new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${uid}` } });

const week = periodKeysFor(new Date()).weekly;
const statsDoc = (scopeId: string, credit: number) => ({
  scopeId, window: 'weekly', periodKey: week, granularity: 'city', totalCredit: credit, activeMemberCount: 3,
});

function seedCityBoard() {
  return makeFakeAdminDb({
    'authorities/sderot': { name: 'שדרות', type: 'city' },
    'authorities/ofakim': { name: 'אופקים', type: 'city' },
    'authorities/demo-city': { name: 'עיריית דמו', type: 'city', isDemo: true },
    [`league_scope_stats/${week}_sderot`]: statsDoc('sderot', 100),
    [`league_scope_stats/${week}_ofakim`]: statsDoc('ofakim', 50),
    [`league_scope_stats/${week}_demo-city`]: statsDoc('demo-city', 500),
    'demo_registry/viewers': { uids: ['viewerUid'] },
  });
}

beforeEach(() => __resetDemoWorldCachesForTests());

describe('scope-stats — demo cities', () => {
  it('a real caller never sees the demo city', async () => {
    const f = seedCityBoard();
    st.db = f.db;
    const body = await (await scopeStats(req('/api/leagues/scope-stats?board=city&window=weekly', 'realUid'))).json();
    expect(body.entries.map((e: any) => e.scopeId)).toEqual(['sderot', 'ofakim']);
  });

  it('a registered viewer and a demo user see it, ranked among the cities', async () => {
    for (const uid of ['viewerUid', 'demo_c07']) {
      st.db = seedCityBoard().db;
      const body = await (await scopeStats(req('/api/leagues/scope-stats?board=city&window=weekly', uid))).json();
      expect(body.entries.map((e: any) => e.scopeId)).toEqual(['demo-city', 'sderot', 'ofakim']);
    }
  });

  it('a real board with no demo scope never reads demo_registry', async () => {
    const f = makeFakeAdminDb({
      'authorities/sderot': { name: 'שדרות', type: 'city' },
      [`league_scope_stats/${week}_sderot`]: statsDoc('sderot', 100),
    });
    st.db = f.db;
    const body = await (await scopeStats(req('/api/leagues/scope-stats?board=city&window=weekly', 'realUid'))).json();
    expect(body.entries).toHaveLength(1);
    expect(f.reads.some((r) => r.startsWith('demo_registry'))).toBe(false);
  });

  it("a demo city's neighborhood board is empty for a real caller", async () => {
    const f = makeFakeAdminDb({
      'authorities/demo-city-n1': { name: 'שכונת דמו', type: 'neighborhood', parentAuthorityId: 'demo-city', isDemo: true },
      [`league_scope_stats/${week}_demo-city-n1`]: { ...statsDoc('demo-city-n1', 10), granularity: 'neighborhood', parentId: 'demo-city' },
    });
    st.db = f.db;
    const real = await (await scopeStats(req('/api/leagues/scope-stats?board=neighborhood&parentId=demo-city&window=weekly', 'realUid'))).json();
    expect(real.entries).toEqual([]);
    const demo = await (await scopeStats(req('/api/leagues/scope-stats?board=neighborhood&parentId=demo-city&window=weekly', 'demo_c01'))).json();
    expect(demo.entries.map((e: any) => e.scopeId)).toEqual(['demo-city-n1']);
  });
});

describe('individual-board — demo city ranks the demo cohort', () => {
  const post = (authorUid: string, ageGroup: string, authorityId: string) => ({
    authorUid, authorName: authorUid, ageGroup, authorityId, activityCredit: 10, createdAt: Timestamp.fromDate(new Date()),
  });
  const seed = () =>
    makeFakeAdminDb({
      'userAge/realUid': { ageGroup: 'adult' },
      'userAge/viewerUid': { ageGroup: 'adult' },
      'demo_registry/viewers': { uids: ['viewerUid'] },
      'feed_posts/p1': post('demo_c01', 'demo', 'demo-city'),
      'feed_posts/p2': post('demo_c02', 'demo', 'demo-city'),
      'feed_posts/p3': post('realA', 'adult', 'sderot'),
      'feed_posts/p4': post('realB', 'adult', 'sderot'),
    });

  it('the viewer sees the demo residents on the demo city board', async () => {
    st.db = seed().db;
    const body = await (await individualBoard(req('/api/leagues/individual-board?mode=credit&scope=city&scopeId=demo-city&window=weekly', 'viewerUid'))).json();
    expect(body.entries.map((e: any) => e.uid).sort()).toEqual(['demo_c01', 'demo_c02']);
  });

  it('a real caller asking for the demo city gets an empty board', async () => {
    st.db = seed().db;
    const body = await (await individualBoard(req('/api/leagues/individual-board?mode=credit&scope=city&scopeId=demo-city&window=weekly&max=10', 'realUid'))).json();
    expect(body.entries).toEqual([]);
  });

  it('a real city board is unchanged and reads no demo_registry', async () => {
    const f = seed();
    st.db = f.db;
    const body = await (await individualBoard(req('/api/leagues/individual-board?mode=credit&scope=city&scopeId=sderot&window=weekly', 'realUid'))).json();
    expect(body.entries.map((e: any) => e.uid).sort()).toEqual(['realA', 'realB']);
    expect(f.reads.some((r) => r.startsWith('demo_registry'))).toBe(false);
  });
});
