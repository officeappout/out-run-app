import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the park-scope field-mapping bug: getStreakLeaderboard
// and getStepsLeaderboard used to hardcode `where('authorityId', ...)`
// regardless of `scope`, so selecting Park (or any future non-city scope)
// silently returned an empty leaderboard instead of filtering by the right
// field. Fixed via the shared scopeToField() mapping — these tests prove
// each scope now resolves to (and queries by) its own field, not just that
// the helper function itself is correct in isolation.

const state = vi.hoisted(() => ({
  STREAKS: [] as { id: string; currentStreak: number; authorityId?: string; parkId?: string; neighborhoodId?: string; displayName?: string }[],
  DAILY: [] as { id: string; userId: string; steps: number; date: string; authorityId?: string; parkId?: string; neighborhoodId?: string; displayName?: string }[],
  whereClauses: [] as { field: string; op: string; value: unknown }[],
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
    orderBy: (field: string, dir: string) => ({ __kind: 'orderBy', field, dir }),
    limit: (n: number) => ({ __kind: 'limit', n }),
    query: (col: { __col: string }, ...constraints: { __kind: string; field?: string; op?: string; value?: unknown }[]) => ({
      __col: col.__col,
      __wheres: constraints
        .filter((c) => c.__kind === 'where')
        .map((c) => ({ field: c.field!, op: c.op!, value: c.value })),
    }),
    getDocs: async (q: { __col: string; __wheres: { field: string; op: string; value: unknown }[] }) => {
      state.whereClauses.push(...q.__wheres);

      const matches = (docFields: Record<string, unknown>) =>
        q.__wheres.every((w) => {
          if (w.field === 'date') return true; // date-range constraints — not under test here
          return docFields[w.field] === w.value;
        });

      if (q.__col === 'streaks') {
        const matched = state.STREAKS.filter((s) => matches(s as unknown as Record<string, unknown>));
        return { forEach: (fn: (d: { id: string; data: () => unknown }) => void) => matched.forEach((s) => fn({ id: s.id, data: () => s } as { id: string; data: () => unknown })) };
      }
      if (q.__col === 'dailyActivity') {
        const matched = state.DAILY.filter((s) => matches(s as unknown as Record<string, unknown>));
        return { forEach: (fn: (d: { id: string; data: () => unknown }) => void) => matched.forEach((s) => fn({ id: s.id, data: () => s } as { id: string; data: () => unknown })) };
      }
      return { forEach: () => {} };
    },
    Timestamp: FakeTimestamp,
  };
});

import { scopeToField, getStreakLeaderboard, getStepsLeaderboard, type LeaderboardScope } from '../ranking.service';

beforeEach(() => {
  state.STREAKS = [];
  state.DAILY = [];
  state.whereClauses = [];
});

describe('scopeToField — single source of truth for scope→field mapping', () => {
  it.each<[LeaderboardScope, string | null]>([
    ['city', 'authorityId'],
    ['school', 'schoolId'],
    ['park', 'parkId'],
    ['neighborhood', 'neighborhoodId'],
    ['global', null],
    ['league', null],
    ['tenant', null],
  ])('%s -> %s', (scope, expected) => {
    expect(scopeToField(scope)).toBe(expected);
  });
});

describe('getStreakLeaderboard — scoped by the correct field, not always authorityId', () => {
  it('park scope filters by parkId, not authorityId (the original bug)', async () => {
    state.STREAKS = [
      { id: 'u1', currentStreak: 5, parkId: 'park-1', displayName: 'A' },
      { id: 'u2', currentStreak: 9, authorityId: 'city-1', displayName: 'B' }, // wrong field — must be excluded
    ];

    const result = await getStreakLeaderboard({ scope: 'park', scopeId: 'park-1', currentUid: 'x' });

    expect(state.whereClauses).toContainEqual({ field: 'parkId', op: '==', value: 'park-1' });
    expect(state.whereClauses).not.toContainEqual(expect.objectContaining({ field: 'authorityId' }));
    expect(result.entries.map((e) => e.uid)).toEqual(['u1']);
  });

  it('neighborhood scope filters by neighborhoodId', async () => {
    state.STREAKS = [
      { id: 'u1', currentStreak: 3, neighborhoodId: 'nb-1', displayName: 'A' },
      { id: 'u2', currentStreak: 8, authorityId: 'city-1', displayName: 'B' },
    ];

    const result = await getStreakLeaderboard({ scope: 'neighborhood', scopeId: 'nb-1', currentUid: 'x' });

    expect(state.whereClauses).toContainEqual({ field: 'neighborhoodId', op: '==', value: 'nb-1' });
    expect(result.entries.map((e) => e.uid)).toEqual(['u1']);
  });

  it('city scope still filters by authorityId (no regression)', async () => {
    state.STREAKS = [{ id: 'u1', currentStreak: 4, authorityId: 'city-1', displayName: 'A' }];

    await getStreakLeaderboard({ scope: 'city', scopeId: 'city-1', currentUid: 'x' });

    expect(state.whereClauses).toContainEqual({ field: 'authorityId', op: '==', value: 'city-1' });
  });

  it('global scope adds no scope-field where clause', async () => {
    state.STREAKS = [{ id: 'u1', currentStreak: 4, authorityId: 'city-1', displayName: 'A' }];

    await getStreakLeaderboard({ scope: 'global', scopeId: null, currentUid: 'x' });

    expect(state.whereClauses.filter((w) => w.field !== 'date')).toHaveLength(0);
  });
});

describe('getStepsLeaderboard — scoped by the correct field, not always authorityId', () => {
  const today = new Date().toISOString().split('T')[0];

  it('park scope filters by parkId, not authorityId (the original bug)', async () => {
    state.DAILY = [
      { id: 'd1', userId: 'u1', steps: 5000, date: today, parkId: 'park-1', displayName: 'A' },
      { id: 'd2', userId: 'u2', steps: 9000, date: today, authorityId: 'city-1', displayName: 'B' },
    ];

    const result = await getStepsLeaderboard({ scope: 'park', scopeId: 'park-1', currentUid: 'x' });

    expect(state.whereClauses).toContainEqual({ field: 'parkId', op: '==', value: 'park-1' });
    expect(result.entries.map((e) => e.uid)).toEqual(['u1']);
  });

  it('neighborhood scope filters by neighborhoodId', async () => {
    state.DAILY = [
      { id: 'd1', userId: 'u1', steps: 4000, date: today, neighborhoodId: 'nb-1', displayName: 'A' },
      { id: 'd2', userId: 'u2', steps: 9000, date: today, authorityId: 'city-1', displayName: 'B' },
    ];

    const result = await getStepsLeaderboard({ scope: 'neighborhood', scopeId: 'nb-1', currentUid: 'x' });

    expect(state.whereClauses).toContainEqual({ field: 'neighborhoodId', op: '==', value: 'nb-1' });
    expect(result.entries.map((e) => e.uid)).toEqual(['u1']);
  });
});
