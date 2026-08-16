import { describe, it, expect, vi, beforeEach } from 'vitest';

// getScopeCompetitionLeaderboard ranks scopes (cities, or neighborhoods)
// AGAINST EACH OTHER as competing entities — one row per scope, not one row
// per user/group. Adapted from getGroupCompetitionLeaderboard's aggregation
// engine, grouped by authorityId or neighborhoodId instead of groupIds.

const state = vi.hoisted(() => ({
  POSTS: [] as { id: string; authorUid: string; activityCredit: number; authorityId?: string; neighborhoodId?: string }[],
  AUTHORITIES: {} as Record<string, { name: string }>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => {
  class FakeTimestamp {
    constructor(public ms: number) {}
    static fromDate(d: Date) { return new FakeTimestamp(d.getTime()); }
    toDate() { return new Date(this.ms); }
  }
  return {
    collection: (_db: unknown, name: string) => ({ __col: name }),
    doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
    getDoc: async (ref: { __col: string; __id: string }) => {
      if (ref.__col === 'authorities') {
        const a = state.AUTHORITIES[ref.__id];
        return { exists: () => !!a, data: () => a };
      }
      return { exists: () => false, data: () => undefined };
    },
    where: (field: string, op: string, value: unknown) => ({ __kind: 'where', field, op, value }),
    query: (col: { __col: string }) => ({ __col: col.__col }),
    getDocs: async (q: { __col: string }) => {
      if (q.__col === 'feed_posts') {
        return { forEach: (fn: (d: { id: string; data: () => unknown }) => void) => state.POSTS.forEach((p) => fn({ id: p.id, data: () => p })) };
      }
      return { forEach: () => {} };
    },
    Timestamp: FakeTimestamp,
  };
});

import { getScopeCompetitionLeaderboard } from '../ranking.service';

beforeEach(() => {
  state.POSTS = [];
  state.AUTHORITIES = {};
});

describe('getScopeCompetitionLeaderboard — scopes ranked against each other', () => {
  it('city granularity: aggregates by authorityId, one row per city', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' },
      { id: 'p2', authorUid: 'u2', activityCredit: 20, authorityId: 'city-tlv' },
      { id: 'p3', authorUid: 'u3', activityCredit: 100, authorityId: 'city-haifa' },
    ];
    state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' }, 'city-haifa': { name: 'חיפה' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries).toHaveLength(2);
    // Haifa: 1 member, avg 100. Tel Aviv: 2 members, total 30, avg 15. Haifa ranks first.
    expect(result.entries[0]).toMatchObject({ rank: 1, scopeId: 'city-haifa', scopeName: 'חיפה', avgScore: 100, activeMemberCount: 1 });
    expect(result.entries[1]).toMatchObject({ rank: 2, scopeId: 'city-tlv', scopeName: 'תל אביב', avgScore: 15, activeMemberCount: 2 });
  });

  it('neighborhood granularity: aggregates by neighborhoodId, ignores authorityId entirely', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv', neighborhoodId: 'nb-1' },
      { id: 'p2', authorUid: 'u2', activityCredit: 30, authorityId: 'city-tlv', neighborhoodId: 'nb-2' },
    ];
    state.AUTHORITIES = { 'nb-1': { name: 'שכונה א' }, 'nb-2': { name: 'שכונה ב' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly' });

    expect(result.entries.map((e) => e.scopeId)).toEqual(['nb-2', 'nb-1']); // higher avg first
  });

  it('posts missing the grouping field entirely are excluded, not bucketed under "undefined"', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10 }, // no authorityId at all
      { id: 'p2', authorUid: 'u2', activityCredit: 20, authorityId: 'city-tlv' },
    ];
    state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].scopeId).toBe('city-tlv');
  });

  it('neighborhood granularity returns empty (not an error) when no posts carry neighborhoodId yet', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' }]; // pre-stamping shape

    const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly' });

    expect(result.entries).toEqual([]);
  });

  it('falls back to the raw id as scopeName when the authorities doc lookup fails', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-unknown' }];
    state.AUTHORITIES = {}; // no matching doc

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries[0].scopeName).toBe('city-unknown');
  });

  it('multiple posts from the same member in the same scope count once toward activeMemberCount', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' },
      { id: 'p2', authorUid: 'u1', activityCredit: 15, authorityId: 'city-tlv' },
    ];
    state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries[0]).toMatchObject({ totalScore: 25, activeMemberCount: 1, avgScore: 25 });
  });
});
