import { describe, it, expect, vi, beforeEach } from 'vitest';

// מרחק pre-launch backend task: getDistanceLeaderboard sums real
// distanceKm (a genuine feed_posts field — feed.service.ts createWorkoutPost)
// instead of activityCredit, mirroring getLeaderboard's shape. Hardcoded to
// activityCategory === 'cardio' since distanceKm is only meaningfully
// non-zero there; strength posts write it as null.

const state = vi.hoisted(() => ({
  POSTS: [] as {
    id: string;
    authorUid: string;
    authorName?: string;
    distanceKm?: number | null;
    ageGroup?: string;
    authorityId?: string;
    activityCategory?: string;
  }[],
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
    doc: vi.fn(),
    getDoc: vi.fn(async () => ({ exists: () => false })),
    where: (field: string, op: string, value: unknown) => ({ __kind: 'where', field, op, value }),
    orderBy: vi.fn(),
    limit: vi.fn(),
    query: (col: { __col: string }, ...constraints: { __kind: string; field?: string; op?: string; value?: unknown }[]) => ({
      __col: col.__col,
      __wheres: constraints.filter((c) => c.__kind === 'where').map((c) => ({ field: c.field!, op: c.op!, value: c.value })),
    }),
    getDocs: async (q: { __col: string; __wheres: { field: string; op: string; value: unknown }[] }) => {
      const matched = state.POSTS.filter((p) =>
        q.__wheres.every((w) => {
          if (w.field === 'createdAt') return true; // time-window constraint — not under test here
          return (p as Record<string, unknown>)[w.field] === w.value;
        }),
      );
      return {
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) =>
          matched.forEach((p) => fn({ id: p.id, data: () => p })),
      };
    },
    Timestamp: FakeTimestamp,
  };
});

import { getDistanceLeaderboard } from '../ranking.service';

beforeEach(() => {
  state.POSTS = [];
});

describe('getDistanceLeaderboard — real summed distanceKm, not activityCredit', () => {
  it('sums distanceKm per user and every entry is a finite number', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', authorName: 'דנה', distanceKm: 5.2, ageGroup: 'adult', activityCategory: 'cardio' },
      { id: 'p2', authorUid: 'u1', authorName: 'דנה', distanceKm: 3.1, ageGroup: 'adult', activityCategory: 'cardio' },
      { id: 'p3', authorUid: 'u2', authorName: 'עומר', distanceKm: 10, ageGroup: 'adult', activityCategory: 'cardio' },
    ];

    const result = await getDistanceLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'u1' });

    expect(result.entries.every((e) => Number.isFinite(e.totalCredit))).toBe(true);
    expect(result.entries).toMatchObject([
      { uid: 'u2', totalCredit: 10, workoutCount: 1 },
      { uid: 'u1', totalCredit: 8.3, workoutCount: 2 },
    ]);
  });

  it('skips posts with no distance (null/undefined/zero) instead of counting them as 0', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', authorName: 'A', distanceKm: null, ageGroup: 'adult', activityCategory: 'cardio' },
      { id: 'p2', authorUid: 'u1', authorName: 'A', ageGroup: 'adult', activityCategory: 'cardio' }, // distanceKm entirely absent
      { id: 'p3', authorUid: 'u1', authorName: 'A', distanceKm: 0, ageGroup: 'adult', activityCategory: 'cardio' },
      { id: 'p4', authorUid: 'u1', authorName: 'A', distanceKm: 4, ageGroup: 'adult', activityCategory: 'cardio' },
    ];

    const result = await getDistanceLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'u1' });

    // workoutCount is 1, not 4 — the 3 distance-less posts never entered the map.
    expect(result.entries).toMatchObject([{ uid: 'u1', totalCredit: 4, workoutCount: 1 }]);
  });

  it('only counts activityCategory "cardio" — a strength post with a stray distanceKm is excluded', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', authorName: 'A', distanceKm: 5, ageGroup: 'adult', activityCategory: 'cardio' },
      { id: 'p2', authorUid: 'u1', authorName: 'A', distanceKm: 999, ageGroup: 'adult', activityCategory: 'strength' },
    ];

    const result = await getDistanceLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'u1' });

    expect(result.entries).toMatchObject([{ uid: 'u1', totalCredit: 5 }]);
  });

  it('scopes by authorityId like every other city-scoped leaderboard here', async () => {
    state.POSTS = [
      { id: 'p1', authorUid: 'u1', authorName: 'A', distanceKm: 5, ageGroup: 'adult', activityCategory: 'cardio', authorityId: 'city-tlv' },
      { id: 'p2', authorUid: 'u2', authorName: 'B', distanceKm: 7, ageGroup: 'adult', activityCategory: 'cardio', authorityId: 'city-haifa' },
    ];

    const result = await getDistanceLeaderboard({ scope: 'city', scopeId: 'city-tlv', timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'u1' });

    expect(result.entries.map((e) => e.uid)).toEqual(['u1']);
  });

  it('returns myEntry with totalCredit 0 (not NaN) when the current user has no distance posts at all', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'other', authorName: 'B', distanceKm: 5, ageGroup: 'adult', activityCategory: 'cardio' }];

    const result = await getDistanceLeaderboard({ scope: 'global', scopeId: null, timeWindow: 'weekly', ageGroup: 'adult', currentUid: 'me', currentName: 'אני' });

    expect(result.myEntry).toMatchObject({ uid: 'me', totalCredit: 0, isCurrentUser: true });
    expect(Number.isFinite(result.myEntry!.totalCredit)).toBe(true);
  });
});
