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

// Rules-prep (26.10): getLeaderboard runs on the server engine; drive it through this file's fakes.
vi.mock('../feed-board.client', async () => {
  const core = await import('../feed-board.core');
  const { clientSdkReader } = await import('./helpers/client-sdk-feed-reader');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchFeedBoard: async (req: any) => core.runFeedBoard(req, clientSdkReader(), req.currentUid ?? ''),
  };
});

import { getWindowStart, getLeaderboard } from '../ranking.service';

beforeEach(() => {
  state.POSTS = [];
  state.whereClauses = [];
});

describe('getWindowStart — daily/weekly/monthly', () => {
  // Frozen to a mid-month Wednesday: on real "now" the ordering below broke on
  // 01.11.2026 (a Sunday), when the calendar week (from Monday 26.10) started
  // before the calendar month. That is correct behaviour, pinned separately below.
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 19, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); });

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

  it('early in a month the calendar week can start before the month (01.11.2026, a Sunday)', () => {
    vi.setSystemTime(new Date(2026, 10, 1, 7, 0, 0));
    expect(getWindowStart('daily')).toEqual(new Date(2026, 10, 1));
    expect(getWindowStart('weekly')).toEqual(new Date(2026, 9, 26)); // Monday
    expect(getWindowStart('monthly')).toEqual(new Date(2026, 10, 1));
    expect(getWindowStart('weekly').getTime()).toBeLessThan(getWindowStart('monthly').getTime());
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
    // The window start now travels as the client's ISO `since` and reaches the query as a Date.
    const v = createdAtClause!.value as Date | { ms: number };
    const ms = v instanceof Date ? v.getTime() : v.ms;
    expect(ms).toBe(getWindowStart('daily').getTime());
    expect(ms).not.toBe(getWindowStart('weekly').getTime());
    expect(ms).not.toBe(getWindowStart('monthly').getTime());
  });
});
