import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pre-launch backend task: add 'daily' alongside weekly/monthly so the TIME
// dropdown's יומי/שבועי/חודשי all work. getWindowStart is the single source
// of truth every leaderboard function threads through
// (Timestamp.fromDate(getWindowStart(timeWindow))), so covering it here
// proves the day-scoped query path is wired everywhere at once — not just
// that the pure helper computes the right Date.

const state = vi.hoisted(() => ({
  POSTS: [] as { id: string; authorUid: string; activityCredit: number; ageGroup?: string }[],
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
    orderBy: vi.fn(),
    limit: vi.fn(),
    query: (col: { __col: string }, ...constraints: { __kind: string; field?: string; op?: string; value?: unknown }[]) => ({
      __col: col.__col,
      __wheres: constraints.filter((c) => c.__kind === 'where').map((c) => ({ field: c.field!, op: c.op!, value: c.value })),
    }),
    getDocs: async (q: { __col: string; __wheres: { field: string; op: string; value: unknown }[] }) => {
      state.whereClauses.push(...q.__wheres);
      return {
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) =>
          state.POSTS.forEach((p) => fn({ id: p.id, data: () => p })),
      };
    },
    Timestamp: FakeTimestamp,
  };
});

import { getWindowStart, getLeaderboard } from '../ranking.service';

beforeEach(() => {
  state.POSTS = [];
  state.whereClauses = [];
});

describe('getWindowStart — daily/weekly/monthly', () => {
  it('daily returns the start of today (local midnight)', () => {
    const now = new Date();
    const start = getWindowStart('daily');
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getDate()).toBe(now.getDate());
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('daily is strictly more recent than (or equal to) weekly and monthly starts', () => {
    const daily = getWindowStart('daily').getTime();
    const weekly = getWindowStart('weekly').getTime();
    const monthly = getWindowStart('monthly').getTime();
    expect(daily).toBeGreaterThanOrEqual(weekly);
    expect(weekly).toBeGreaterThanOrEqual(monthly);
  });
});

describe('getLeaderboard — daily time window actually reaches the query', () => {
  // Fixed to a Wednesday (not a week/month boundary) so daily/weekly/monthly
  // are guaranteed distinct — real "now" flakes on Mondays (daily === weekly)
  // and the 1st of the month (weekly === monthly or daily === monthly).
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 19, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  it('threads getWindowStart(\'daily\') into the createdAt >= where-clause, not the weekly/monthly start', async () => {
    state.POSTS = [{ id: 'p1', authorUid: 'u1', activityCredit: 10, ageGroup: 'adult' }];

    await getLeaderboard({
      scope: 'global',
      scopeId: null,
      category: 'overall',
      timeWindow: 'daily',
      ageGroup: 'adult',
      currentUid: 'u1',
    });

    const createdAtClause = state.whereClauses.find((w) => w.field === 'createdAt');
    expect(createdAtClause).toBeDefined();
    expect((createdAtClause!.value as { ms: number }).ms).toBe(getWindowStart('daily').getTime());
    expect((createdAtClause!.value as { ms: number }).ms).not.toBe(getWindowStart('weekly').getTime());
    expect((createdAtClause!.value as { ms: number }).ms).not.toBe(getWindowStart('monthly').getTime());
  });
});
