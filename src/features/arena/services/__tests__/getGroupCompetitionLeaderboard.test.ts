import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the ephemeral-session leak: single-session
// run/walk-invite groups (api/invite/run-session/route.ts, type: 'ephemeral',
// e.g. "ריצה מתוזמנת") were never filtered out of the Groups competition
// leaderboard, so a one-off invite session could show up ranked alongside
// real persistent community groups. Fixed by reading each group's `type`
// field alongside its name and excluding type === 'ephemeral'.

const state = vi.hoisted(() => ({
  POSTS: [] as { id: string; authorUid: string; activityCredit: number; authorityId?: string; groupIds?: string[] }[],
  GROUPS: {} as Record<string, { name: string; type?: string }>,
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
      if (ref.__col === 'community_groups') {
        const g = state.GROUPS[ref.__id];
        return { exists: () => !!g, data: () => g };
      }
      return { exists: () => false, data: () => undefined };
    },
    where: (field: string, op: string, value: unknown) => ({ __kind: 'where', field, op, value }),
    orderBy: (field: string, dir: string) => ({ __kind: 'orderBy', field, dir }),
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

import { getGroupCompetitionLeaderboard } from '../ranking.service';

beforeEach(() => {
  state.POSTS = [];
  state.GROUPS = {};
});

describe('getGroupCompetitionLeaderboard — ephemeral run/walk-invite sessions excluded', () => {
  it('excludes a group whose community_groups doc has type: "ephemeral"', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, groupIds: ['grp-real'] },
      { id: 'p2', authorUid: 'u2', activityCredit: 999, groupIds: ['grp-ephemeral'] },
    ];
    state.GROUPS = {
      'grp-real': { name: 'חבורת הריצה', type: 'user' },
      'grp-ephemeral': { name: 'ריצה מתוזמנת', type: 'ephemeral' },
    };

    const result = await getGroupCompetitionLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly' });

    expect(result.entries.map((e) => e.groupId)).toEqual(['grp-real']);
    expect(result.entries.some((e) => e.groupName === 'ריצה מתוזמנת')).toBe(false);
  });

  it('includes a group whose type is undefined (legacy docs without a type field) — only exact "ephemeral" is excluded', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, groupIds: ['grp-legacy'] }];
    state.GROUPS = { 'grp-legacy': { name: 'קבוצה ישנה' } }; // no `type` field at all

    const result = await getGroupCompetitionLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly' });

    expect(result.entries.map((e) => e.groupId)).toEqual(['grp-legacy']);
  });

  it('returns an empty result (not an error) when every competing group is ephemeral', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, groupIds: ['grp-eph'] }];
    state.GROUPS = { 'grp-eph': { name: 'הליכה מתוזמנת', type: 'ephemeral' } };

    const result = await getGroupCompetitionLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly' });

    expect(result.entries).toEqual([]);
  });

  it('still ranks multiple real groups correctly by avg score, unaffected by the ephemeral filter', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', activityCredit: 10, groupIds: ['grp-a'] },
      { id: 'p2', authorUid: 'u2', activityCredit: 50, groupIds: ['grp-b'] },
      { id: 'p3', authorUid: 'u3', activityCredit: 999, groupIds: ['grp-eph'] },
    ];
    state.GROUPS = {
      'grp-a': { name: 'קבוצה א', type: 'user' },
      'grp-b': { name: 'קבוצה ב', type: 'user' },
      'grp-eph': { name: 'ריצה מתוזמנת', type: 'ephemeral' },
    };

    const result = await getGroupCompetitionLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly' });

    expect(result.entries.map((e) => e.groupId)).toEqual(['grp-b', 'grp-a']);
  });
});
