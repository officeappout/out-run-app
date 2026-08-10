import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the neighborhood-linkage bug: core.authorityId is
// ALWAYS the city-level id (never repointed to a neighborhood — see
// UnifiedLocationStep.tsx), so grouping users by core.authorityId against
// child (neighborhood) authority ids always produced an empty bucket for
// every neighborhood. The fix groups by the separate core.neighborhoodId
// field instead, and fetches city users via a single `==` match rather than
// an `in` match against neighborhood ids.

const state = vi.hoisted(() => ({
  CHILDREN: [] as { id: string; name: string }[],
  USERS: [] as { id: string; core: Record<string, unknown> }[],
  WORKOUTS: [] as { id: string; userId: string; duration: number; date: unknown }[],
  userQueryShapes: [] as { field: string; op: string; value: unknown }[],
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
    getDoc: vi.fn(),
    where: (field: string, op: string, value: unknown) => ({ __where: { field, op, value } }),
    query: (col: { __col: string }, ...wheres: { __where: { field: string; op: string; value: unknown } }[]) => ({
      __col: col.__col,
      __wheres: wheres.map((w) => w.__where),
    }),
    getDocs: async (q: { __col: string; __wheres: { field: string; op: string; value: unknown }[] }) => {
      if (q.__col === 'users') {
        state.userQueryShapes.push(...q.__wheres);
        const authorityWhere = q.__wheres.find((w) => w.field === 'core.authorityId');
        const matched = state.USERS.filter((u) => {
          if (!authorityWhere) return false;
          if (authorityWhere.op === '==') return u.core.authorityId === authorityWhere.value;
          if (authorityWhere.op === 'in') return (authorityWhere.value as unknown[]).includes(u.core.authorityId);
          return false;
        });
        return { docs: matched.map((u) => ({ id: u.id, data: () => ({ core: u.core }) })) };
      }
      if (q.__col === 'workouts') {
        const userWhere = q.__wheres.find((w) => w.field === 'userId');
        const ids = (userWhere?.value as string[]) ?? [];
        const matched = state.WORKOUTS.filter((w) => ids.includes(w.userId));
        return { docs: matched.map((w) => ({ id: w.id, data: () => w })) };
      }
      return { docs: [] };
    },
    Timestamp: FakeTimestamp,
  };
});

vi.mock('../authority.service', () => ({
  getChildrenByParent: async () => state.CHILDREN,
}));

import { getNeighborhoodBreakdown } from '../analytics.service';

beforeEach(() => {
  state.CHILDREN = [];
  state.USERS = [];
  state.WORKOUTS = [];
  state.userQueryShapes = [];
});

describe('getNeighborhoodBreakdown — groups by neighborhoodId, not authorityId', () => {
  it('fetches city users via a single == match on core.authorityId, not an `in` match against neighborhood ids', async () => {
    state.CHILDREN = [{ id: 'nb-1', name: 'שכונה א' }];
    state.USERS = [{ id: 'u1', core: { authorityId: 'city-1', neighborhoodId: 'nb-1' } }];

    await getNeighborhoodBreakdown('city-1');

    expect(state.userQueryShapes).toHaveLength(1);
    expect(state.userQueryShapes[0]).toEqual({ field: 'core.authorityId', op: '==', value: 'city-1' });
  });

  it('a user whose core.authorityId equals a neighborhood id (the old, wrong shape) is NOT matched — authorityId is always the city', async () => {
    state.CHILDREN = [{ id: 'nb-1', name: 'שכונה א' }];
    // Simulates the pre-fix (buggy) data shape some test fixture might carry —
    // must NOT be picked up by the city-level `==` query.
    state.USERS = [{ id: 'u-legacy', core: { authorityId: 'nb-1' } }];

    const rows = await getNeighborhoodBreakdown('city-1');

    expect(rows[0].totalUsers).toBe(0);
  });

  it('buckets users by core.neighborhoodId; users with no neighborhoodId land in no bucket', async () => {
    state.CHILDREN = [
      { id: 'nb-1', name: 'שכונה א' },
      { id: 'nb-2', name: 'שכונה ב' },
    ];
    state.USERS = [
      { id: 'u1', core: { authorityId: 'city-1', neighborhoodId: 'nb-1' } },
      { id: 'u2', core: { authorityId: 'city-1', neighborhoodId: 'nb-1' } },
      { id: 'u3', core: { authorityId: 'city-1', neighborhoodId: 'nb-2' } },
      { id: 'u4', core: { authorityId: 'city-1' } }, // no neighborhoodId — city-only pick
    ];

    const rows = await getNeighborhoodBreakdown('city-1');

    const byId = Object.fromEntries(rows.map((r) => [r.neighborhoodId, r]));
    expect(byId['nb-1'].totalUsers).toBe(2);
    expect(byId['nb-2'].totalUsers).toBe(1);
    // Total across buckets (3) is intentionally less than total city users (4) —
    // u4 has no neighborhoodId and is excluded from every bucket, not force-fit
    // into one.
    const bucketedTotal = rows.reduce((sum, r) => sum + r.totalUsers, 0);
    expect(bucketedTotal).toBe(3);
  });

  it('active/workout stats still attach correctly per neighborhood after the regroup', async () => {
    state.CHILDREN = [{ id: 'nb-1', name: 'שכונה א' }];
    state.USERS = [{ id: 'u1', core: { authorityId: 'city-1', neighborhoodId: 'nb-1' } }];
    const now = new Date();
    state.WORKOUTS = [{ id: 'w1', userId: 'u1', duration: 1800, date: now }];

    const rows = await getNeighborhoodBreakdown('city-1');

    expect(rows[0].activeUsers).toBe(1);
    expect(rows[0].workouts).toBe(1);
  });

  it('returns [] when the city has zero configured neighborhoods (no crash)', async () => {
    state.CHILDREN = [];
    const rows = await getNeighborhoodBreakdown('city-1');
    expect(rows).toEqual([]);
  });
});
