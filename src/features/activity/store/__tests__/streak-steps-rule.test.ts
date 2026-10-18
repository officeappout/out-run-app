/**
 * Streak — a day counts with ≥10 active minutes OR with the daily step goal met
 * (owner decision, Oct 2026). Covers the store paths end to end with Firebase
 * mocked out, plus the pure rules in lib/streak-rules.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocSpy = vi.fn((..._args: unknown[]) => Promise.resolve());
const updateDocSpy = vi.fn((..._args: unknown[]) => Promise.resolve());

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
  updateDoc: (...args: unknown[]) => updateDocSpy(...args),
  serverTimestamp: () => 'server-ts',
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { id: 'u1', core: {} } }) },
}));

import { useActivityStore, getTodayString, getYesterdayString } from '../useActivityStore';
import {
  advanceStreakForDay,
  dayQualifiesByMinutes,
  dayQualifiesBySteps,
  dayQualifiesForStreak,
  effectiveStepsGoal,
} from '../../lib/streak-rules';
import { DAILY_STEP_GOAL } from '@/config/health-goals';

const store = () => useActivityStore.getState();

/** Put "today" into a known state: streak of 4 that last counted yesterday. */
function seedStreakThroughYesterday() {
  store().initialize('u1');
  store().resetToday(); // fresh, empty today (initialize keeps a same-day today)
  useActivityStore.setState({
    currentStreak: 4,
    longestStreak: 4,
    lastStreakDate: getYesterdayString(),
  });
}

/** Simulate passive steps arriving from the server (health sync). */
function receiveStepsFromServer(steps: number) {
  const today = store().today!;
  useActivityStore.setState({ today: { ...today, steps } });
  return store().countTodayIfStepGoalMet();
}

describe('streak — store paths', () => {
  beforeEach(() => {
    setDocSpy.mockClear();
    updateDocSpy.mockClear();
    seedStreakThroughYesterday();
  });

  it('minutes-only day: ≥10 active minutes counts today once', () => {
    store().logWorkout('strength', 12);
    expect(store().currentStreak).toBe(5);
    expect(store().lastStreakDate).toBe(getTodayString());

    store().logWorkout('cardio', 20); // a second workout the same day
    expect(store().currentStreak).toBe(5);
    expect(store().countTodayIfStepGoalMet()).toBe(false); // steps 0 → nothing
    expect(store().currentStreak).toBe(5);
  });

  it('steps-only day: reaching the step goal counts today, once', () => {
    expect(receiveStepsFromServer(DAILY_STEP_GOAL - 1)).toBe(false);
    expect(store().currentStreak).toBe(4);

    expect(receiveStepsFromServer(DAILY_STEP_GOAL)).toBe(true);
    expect(store().currentStreak).toBe(5);
    expect(store().longestStreak).toBe(5);
    expect(store().lastStreakDate).toBe(getTodayString());

    // More steps later the same day (another health sync) → still once.
    expect(receiveStepsFromServer(DAILY_STEP_GOAL + 3000)).toBe(false);
    expect(store().currentStreak).toBe(5);
  });

  it('steps-only day via logSteps also counts', () => {
    store().logSteps(DAILY_STEP_GOAL);
    expect(store().currentStreak).toBe(5);
  });

  it('both rules met the same day → counted exactly once (steps first)', () => {
    receiveStepsFromServer(DAILY_STEP_GOAL);
    store().logWorkout('strength', 15);
    expect(store().currentStreak).toBe(5);
  });

  it('both rules met the same day → counted exactly once (minutes first)', () => {
    store().logWorkout('strength', 15);
    receiveStepsFromServer(DAILY_STEP_GOAL);
    expect(store().currentStreak).toBe(5);
  });

  it('steps day after a gap restarts the streak at 1', () => {
    useActivityStore.setState({ lastStreakDate: '2000-01-01' });
    receiveStepsFromServer(DAILY_STEP_GOAL);
    expect(store().currentStreak).toBe(1);
    expect(store().longestStreak).toBe(4); // best-ever untouched
  });

  it('deleting the workout on a steps-qualified day keeps the streak', async () => {
    store().logWorkout('strength', 15);
    receiveStepsFromServer(DAILY_STEP_GOAL);
    expect(store().currentStreak).toBe(5);

    const res = await store().reverseStreakForToday();
    expect(res.reversed).toBe(false);
    expect(store().currentStreak).toBe(5);
    expect(store().lastStreakDate).toBe(getTodayString());
  });

  it('deleting the workout on a minutes-only day still reverses it', async () => {
    store().logWorkout('strength', 15);
    receiveStepsFromServer(DAILY_STEP_GOAL - 500);
    expect(store().currentStreak).toBe(5);

    const res = await store().reverseStreakForToday();
    expect(res.reversed).toBe(true);
    expect(store().currentStreak).toBe(4);
    expect(store().lastStreakDate).toBe(getYesterdayString());
  });

  it('a steps-counted day writes the advanced streak to streaks/{uid} + the users mirror', async () => {
    receiveStepsFromServer(DAILY_STEP_GOAL);
    // (Earlier tests' fire-and-forget syncs may still land, so look for ours.)
    await vi.waitFor(() =>
      expect(updateDocSpy.mock.calls.some((c) =>
        (c[1] as Record<string, unknown>)?.['progression.currentStreak'] === 5)).toBe(true));
    const streakWrites = setDocSpy.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .filter((p) => p && 'currentStreak' in p);
    expect(streakWrites.some((p) =>
      p.currentStreak === 5 && p.lastActivityDate === getTodayString())).toBe(true);
  });
});

describe('streak-rules (pure)', () => {
  const day = (minutes: number, steps = 0, stepsGoal?: number) => ({
    categories: { strength: { minutes }, cardio: { minutes: 0 }, maintenance: { minutes: 0 } },
    steps,
    stepsGoal,
  });

  it('minutes rule', () => {
    expect(dayQualifiesByMinutes(day(9))).toBe(false);
    expect(dayQualifiesByMinutes(day(10))).toBe(true);
  });

  it('steps rule uses the day goal, falling back to DAILY_STEP_GOAL', () => {
    expect(dayQualifiesBySteps(day(0, 5000, 5000))).toBe(true);
    expect(dayQualifiesBySteps(day(0, 4999, 5000))).toBe(false);
    expect(effectiveStepsGoal({ stepsGoal: undefined })).toBe(DAILY_STEP_GOAL);
    expect(effectiveStepsGoal({ stepsGoal: 0 })).toBe(DAILY_STEP_GOAL);
    expect(dayQualifiesBySteps(day(0, DAILY_STEP_GOAL))).toBe(true);
    expect(dayQualifiesBySteps(day(0, 0, 0))).toBe(false);
  });

  it('either rule qualifies the day', () => {
    expect(dayQualifiesForStreak(day(10))).toBe(true);
    expect(dayQualifiesForStreak(day(0, 9000, 8000))).toBe(true);
    expect(dayQualifiesForStreak(day(5, 100, 8000))).toBe(false);
  });

  it('advanceStreakForDay: idempotent, +1, gap reset, fresh start', () => {
    expect(advanceStreakForDay({ currentStreak: 3, lastStreakDate: '2026-10-18' }, '2026-10-18'))
      .toEqual({ currentStreak: 3, lastStreakDate: '2026-10-18', advanced: false });
    expect(advanceStreakForDay({ currentStreak: 3, lastStreakDate: '2026-10-17' }, '2026-10-18'))
      .toEqual({ currentStreak: 4, lastStreakDate: '2026-10-18', advanced: true });
    expect(advanceStreakForDay({ currentStreak: 3, lastStreakDate: '2026-10-15' }, '2026-10-18'))
      .toEqual({ currentStreak: 1, lastStreakDate: '2026-10-18', advanced: true });
    expect(advanceStreakForDay({ currentStreak: 0, lastStreakDate: '' }, '2026-10-18'))
      .toEqual({ currentStreak: 1, lastStreakDate: '2026-10-18', advanced: true });
    // Month boundary
    expect(advanceStreakForDay({ currentStreak: 7, lastStreakDate: '2026-09-30' }, '2026-10-01').currentStreak)
      .toBe(8);
  });
});
