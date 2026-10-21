/**
 * Saturday rule + streak shields in the activity store (owner decisions 21.10.2026).
 * Flags off → exactly the old streak. Firebase mocked; the flags are mocked per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const flags = vi.hoisted(() => ({ values: {} as Record<string, boolean> }));
vi.mock('@/lib/feature-flag-live', () => ({ readLiveFlag: (k: string) => flags.values[k] === true }));

const setDocSpy = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: () => Promise.resolve({ docs: [] }),
  onSnapshot: () => () => {},
  getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  updateDoc: () => Promise.resolve(),
  serverTimestamp: () => 'server-ts',
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { id: 'u1', core: {} } }) },
}));

import { useActivityStore } from '../useActivityStore';
import { bridgeWrites, brokenNotice, restoreOnLoad, shieldsOnReverse } from '../streak-policy';

const store = () => useActivityStore.getState();

/** Streak docs written to streaks/{uid}, in order (the dailyActivity write has no currentStreak). */
function streakWrites() {
  return setDocSpy.mock.calls
    .map((c) => c[1] as Record<string, unknown>)
    .filter((d) => 'currentStreak' in d)
    .map((d) => ({ currentStreak: d.currentStreak, longestStreak: d.longestStreak, lastActivityDate: d.lastActivityDate, shields: d.shields }));
}

function seed(state: Record<string, unknown>) {
  store().initialize('u1');
  store().resetToday();
  useActivityStore.setState({ streakShields: undefined, streakShieldsEarnedAt: undefined, pendingStreakBridge: null, streakNotice: null, ...state });
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('activity store — Saturday rule and shields', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0)); // Sunday 25.10.2026, local noon
    flags.values = {};
    setDocSpy.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('flags off: a missed Saturday restarts the streak at 1 (unchanged behaviour)', async () => {
    seed({ currentStreak: 6, longestStreak: 6, lastStreakDate: '2026-10-23' });
    store().logWorkout('strength', 12);
    expect(store().currentStreak).toBe(1);
    expect(store().pendingStreakBridge ?? null).toBeNull();
    await flush();
    expect(streakWrites().map((w) => w.currentStreak)).toEqual([1]);
    expect(streakWrites()[0].shields).toBeUndefined();
  });

  it('Saturday rule on: Friday → Sunday continues (+1), bridged as +1 / −1 on Saturday, then today', async () => {
    flags.values = { enableShabbatFreeStreak: true };
    seed({ currentStreak: 6, longestStreak: 6, lastStreakDate: '2026-10-23' });
    store().logWorkout('strength', 12);
    expect(store().currentStreak).toBe(7);
    await flush();
    expect(streakWrites()).toEqual([
      { currentStreak: 7, longestStreak: 7, lastActivityDate: '2026-10-24', shields: undefined },
      { currentStreak: 6, longestStreak: 7, lastActivityDate: '2026-10-24', shields: undefined },
      { currentStreak: 7, longestStreak: 7, lastActivityDate: '2026-10-25', shields: undefined },
    ]);
    expect(store().pendingStreakBridge ?? null).toBeNull();
  });

  it('shields on: a shield covers Saturday when the Saturday rule is off; the 7th day earns one', async () => {
    flags.values = { enableStreakShields: true };
    seed({ currentStreak: 6, longestStreak: 9, lastStreakDate: '2026-10-23', streakShields: 1, streakShieldsEarnedAt: 0 });
    store().logWorkout('strength', 12);
    expect(store().currentStreak).toBe(7);
    // 1 used on Saturday, +1 for reaching 7.
    expect(store().streakShields).toBe(1);
    expect(store().streakShieldsEarnedAt).toBe(7);
    expect(store().streakNotice).toMatchObject({ kind: 'shield_earned', streak: 7 });
    await flush();
    expect(streakWrites().at(-1)).toEqual({ currentStreak: 7, longestStreak: 9, lastActivityDate: '2026-10-25', shields: 1 });
  });

  it('shields on, none held: the gap breaks the streak', () => {
    flags.values = { enableStreakShields: true };
    seed({ currentStreak: 6, longestStreak: 6, lastStreakDate: '2026-10-23', streakShields: 0 });
    store().logWorkout('strength', 12);
    expect(store().currentStreak).toBe(1);
  });

  it('undoing the advance that earned a shield gives it back', async () => {
    flags.values = { enableStreakShields: true };
    seed({ currentStreak: 6, longestStreak: 6, lastStreakDate: '2026-10-24', streakShields: 0 });
    store().logWorkout('strength', 12);
    expect(store().streakShields).toBe(1);
    await store().reverseStreakForToday();
    expect(store().currentStreak).toBe(6);
    expect(store().streakShields).toBe(0);
  });
});

describe('streak-policy helpers', () => {
  const ON = { shabbatFree: true, shields: true };

  it('bridge writes are +1 then −1 per kept day', () => {
    expect(bridgeWrites({ days: ['a', 'b'], prevStreak: 4, prevLongest: 10 })).toEqual([
      { currentStreak: 5, longestStreak: 10, lastActivityDate: 'a' },
      { currentStreak: 4, longestStreak: 10, lastActivityDate: 'a' },
      { currentStreak: 5, longestStreak: 10, lastActivityDate: 'b' },
      { currentStreak: 4, longestStreak: 10, lastActivityDate: 'b' },
    ]);
  });

  it('load: a shield-kept gap shows the "shield kept it" notice; flags off never keep', () => {
    const s = { currentStreak: 9, longestStreak: 9, lastStreakDate: '2026-10-19', shields: 2, shieldsEarnedAt: 7 };
    expect(restoreOnLoad(s, '2026-10-21', ON)).toMatchObject({
      keptByPolicy: true,
      notice: { kind: 'shield_used', days: ['2026-10-20'], left: 1 },
    });
    expect(restoreOnLoad(s, '2026-10-21', { shabbatFree: false, shields: false }).keptByPolicy).toBe(false);
  });

  it('broken card: only the day after, keyed on the last counted day, from a streak of 2', () => {
    const off = { shabbatFree: false, shields: false };
    expect(brokenNotice({ currentStreak: 5, longestStreak: 12, lastStreakDate: '2026-10-19' }, '2026-10-21', off)).toEqual({
      kind: 'broken', previous: 5, best: 12, on: '2026-10-19',
    });
    expect(brokenNotice({ currentStreak: 5, longestStreak: 12, lastStreakDate: '2026-10-15' }, '2026-10-21', off)).toBeNull();
    expect(brokenNotice({ currentStreak: 1, longestStreak: 12, lastStreakDate: '2026-10-19' }, '2026-10-21', off)).toBeNull();
  });

  it('shield undo only for the advance that earned it', () => {
    expect(shieldsOnReverse(7, { streakShields: 1, streakShieldsEarnedAt: 7 }, ON)).toEqual({ streakShields: 0, streakShieldsEarnedAt: 0 });
    expect(shieldsOnReverse(8, { streakShields: 1, streakShieldsEarnedAt: 7 }, ON)).toBeNull();
    expect(shieldsOnReverse(7, { streakShields: 1, streakShieldsEarnedAt: 7 }, { shabbatFree: false, shields: false })).toBeNull();
  });
});
