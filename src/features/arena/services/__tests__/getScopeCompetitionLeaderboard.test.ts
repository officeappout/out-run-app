import { describe, it, expect, vi, beforeEach } from 'vitest';

// getScopeCompetitionLeaderboard ranks scopes (cities, or neighborhoods)
// AGAINST EACH OTHER as competing entities — one row per scope, not one row
// per user/group. Adapted from getGroupCompetitionLeaderboard's aggregation
// engine, grouped by authorityId or neighborhoodId instead of groupIds.
//
// Stage D: ranked by TOTAL score, not average. Neighborhood granularity
// REQUIRES cityAuthorityId — this is a hard correctness gate (a Tel Aviv
// neighborhood must never rank against a Be'er Sheva one), so the mock
// below actually applies `where` filters to the fixture data rather than
// returning every post unconditionally.

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
    query: (col: { __col: string }, ...constraints: { __kind: string; field?: string; op?: string; value?: unknown }[]) => ({
      __col: col.__col,
      __wheres: constraints.filter((c) => c.__kind === 'where').map((c) => ({ field: c.field!, op: c.op!, value: c.value })),
    }),
    getDocs: async (q: { __col: string; __wheres?: { field: string; op: string; value: unknown }[] }) => {
      if (q.__col === 'feed_posts') {
        const wheres = q.__wheres ?? [];
        const matched = state.POSTS.filter((p) =>
          wheres.every((w) => {
            if (w.field === 'createdAt') return true; // time-window constraint — not under test here
            return (p as Record<string, unknown>)[w.field] === w.value;
          }),
        );
        return { forEach: (fn: (d: { id: string; data: () => unknown }) => void) => matched.forEach((p) => fn({ id: p.id, data: () => p })) };
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
      { id: 'p3', authorUid: 'u3', activityCredit: 25, authorityId: 'city-haifa' },
    ];
    state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' }, 'city-haifa': { name: 'חיפה' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ rank: 1, scopeId: 'city-tlv', scopeName: 'תל אביב', totalScore: 30, activeMemberCount: 2 });
    expect(result.entries[1]).toMatchObject({ rank: 2, scopeId: 'city-haifa', scopeName: 'חיפה', totalScore: 25, activeMemberCount: 1 });
  });

  it('sorts by TOTAL, not average — a city with a higher total but lower per-member average still ranks first', async () => {
    // Tel Aviv: 2 members, total 30, avg 15. Haifa: 1 member, total 25, avg 25.
    // Under the old avg-based sort Haifa would rank #1; under total-based sort Tel Aviv must rank #1.
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' },
      { id: 'p2', authorUid: 'u2', activityCredit: 20, authorityId: 'city-tlv' },
      { id: 'p3', authorUid: 'u3', activityCredit: 25, authorityId: 'city-haifa' },
    ];
    state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' }, 'city-haifa': { name: 'חיפה' } };

    const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly' });

    expect(result.entries.map((e) => e.scopeId)).toEqual(['city-tlv', 'city-haifa']);
    expect(result.entries.every((e) => !('avgScore' in e))).toBe(true);
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

    expect(result.entries[0]).toMatchObject({ totalScore: 25, activeMemberCount: 1 });
  });

  describe('neighborhood granularity — correctness gate: same-city only', () => {
    it('REQUIRED cityAuthorityId missing -> fails closed, returns empty (never a nationwide scan)', async () => {
      state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv', neighborhoodId: 'nb-tlv-1' }];
      state.AUTHORITIES = { 'nb-tlv-1': { name: 'פלורנטין' } };

      const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly' });

      expect(result.entries).toEqual([]);
    });

    it('cityAuthorityId: null -> also fails closed (falsy check, not just undefined)', async () => {
      state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv', neighborhoodId: 'nb-tlv-1' }];

      const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly', cityAuthorityId: null });

      expect(result.entries).toEqual([]);
    });

    it('HARD GATE: a Tel Aviv neighborhood and a Be\'er Sheva neighborhood never appear in the same leaderboard', async () => {
      state.POSTS = [
        { id: 'p1', authorUid: 'u1', activityCredit: 50, authorityId: 'city-tlv', neighborhoodId: 'nb-tlv-florentin' },
        { id: 'p2', authorUid: 'u2', activityCredit: 999, authorityId: 'city-beersheva', neighborhoodId: 'nb-bs-old-city' },
      ];
      state.AUTHORITIES = {
        'nb-tlv-florentin': { name: 'פלורנטין' },
        'nb-bs-old-city': { name: 'העיר העתיקה' },
      };

      const tlvResult = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly', cityAuthorityId: 'city-tlv' });
      expect(tlvResult.entries.map((e) => e.scopeId)).toEqual(['nb-tlv-florentin']);
      expect(tlvResult.entries.some((e) => e.scopeId === 'nb-bs-old-city')).toBe(false);

      const bsResult = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly', cityAuthorityId: 'city-beersheva' });
      expect(bsResult.entries.map((e) => e.scopeId)).toEqual(['nb-bs-old-city']);
      expect(bsResult.entries.some((e) => e.scopeId === 'nb-tlv-florentin')).toBe(false);
    });

    it('with a valid cityAuthorityId, ranks multiple same-city neighborhoods by total', async () => {
      state.POSTS = [
        { id: 'p1', authorUid: 'u1', activityCredit: 30, authorityId: 'city-tlv', neighborhoodId: 'nb-florentin' },
        { id: 'p2', authorUid: 'u2', activityCredit: 10, authorityId: 'city-tlv', neighborhoodId: 'nb-florentin' },
        { id: 'p3', authorUid: 'u3', activityCredit: 45, authorityId: 'city-tlv', neighborhoodId: 'nb-neve-tzedek' },
      ];
      state.AUTHORITIES = { 'nb-florentin': { name: 'פלורנטין' }, 'nb-neve-tzedek': { name: 'נווה צדק' } };

      const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly', cityAuthorityId: 'city-tlv' });

      expect(result.entries.map((e) => e.scopeId)).toEqual(['nb-neve-tzedek', 'nb-florentin']);
      expect(result.entries[1]).toMatchObject({ totalScore: 40, activeMemberCount: 2 });
    });

    it('neighborhood granularity returns empty (not an error) when the city has no neighborhoodId-stamped posts yet', async () => {
      state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' }]; // pre-stamping shape, no neighborhoodId
      state.AUTHORITIES = {};

      const result = await getScopeCompetitionLeaderboard({ granularity: 'neighborhood', timeWindow: 'weekly', cityAuthorityId: 'city-tlv' });

      expect(result.entries).toEqual([]);
    });

    it('cityAuthorityId is ignored for granularity "city" (cities always compete nationwide)', async () => {
      state.POSTS = [
        { id: 'p1', authorUid: 'u1', activityCredit: 10, authorityId: 'city-tlv' },
        { id: 'p2', authorUid: 'u2', activityCredit: 20, authorityId: 'city-haifa' },
      ];
      state.AUTHORITIES = { 'city-tlv': { name: 'תל אביב' }, 'city-haifa': { name: 'חיפה' } };

      const result = await getScopeCompetitionLeaderboard({ granularity: 'city', timeWindow: 'weekly', cityAuthorityId: 'city-tlv' });

      // Both cities still appear — cityAuthorityId must not accidentally narrow city-granularity queries.
      expect(result.entries).toHaveLength(2);
    });
  });
});
