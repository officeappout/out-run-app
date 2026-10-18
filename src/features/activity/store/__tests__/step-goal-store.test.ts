/**
 * The resolved step goal reaches everything that reads today.stepsGoal
 * (home ring, streak steps rule, step-deficit card) and the day doc snapshot;
 * the settings choice writes the ONE source of truth on users/{uid}.progression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocSpy = vi.fn((..._args: unknown[]) => Promise.resolve());
const updateDocSpy = vi.fn((..._args: unknown[]) => Promise.resolve());
let recentDocs: Array<{ date: string; steps: number }> = [];
let profile: { id: string; core: object; progression: Record<string, unknown> } = { id: 'u1', core: {}, progression: {} };

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: () => Promise.resolve({ docs: recentDocs.map((d) => ({ data: () => d })) }),
  onSnapshot: () => () => {},
  getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  updateDoc: (...args: unknown[]) => updateDocSpy(...args),
  serverTimestamp: () => 'server-ts',
  Timestamp: { now: () => ({}) },
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: {
    getState: () => ({
      profile,
      updateProfile: (u: { progression?: Record<string, unknown> }) => {
        profile = { ...profile, progression: { ...profile.progression, ...(u.progression ?? {}) } };
      },
    }),
  },
}));

import { useActivityStore, getTodayString, getYesterdayString } from '../useActivityStore';
import { refreshStepGoal, setStepGoalChoice } from '../../services/step-goal.service';
import { addDays } from '../../lib/step-goal';

const store = () => useActivityStore.getState();

beforeEach(() => {
  setDocSpy.mockClear();
  updateDocSpy.mockClear();
  recentDocs = [];
  profile = { id: 'u1', core: {}, progression: {} };
  useActivityStore.setState({ resolvedStepGoal: null, today: null, lastStreakDate: '', currentStreak: 0 });
  store().initialize('u1');
  store().resetToday();
});

describe('applyResolvedStepGoal', () => {
  it('stamps today.stepsGoal (what the ring / deficit card read)', () => {
    store().applyResolvedStepGoal(6500);
    expect(store().today!.stepsGoal).toBe(6500);
    expect(store().resolvedStepGoal).toBe(6500);
  });

  it('a new today created later gets the resolved goal too', () => {
    store().applyResolvedStepGoal(9500);
    store().resetToday();
    expect(store().today!.stepsGoal).toBe(9500);
  });

  it('the streak steps rule uses the resolved goal', () => {
    useActivityStore.setState({ currentStreak: 2, lastStreakDate: getYesterdayString() });
    useActivityStore.setState({ today: { ...store().today!, steps: 7000 } });
    expect(store().countTodayIfStepGoalMet()).toBe(false); // 7000 < 8000 default
    store().applyResolvedStepGoal(6500);
    expect(store().currentStreak).toBe(3);
    expect(store().lastStreakDate).toBe(getTodayString());
  });
});

describe('refreshStepGoal (client resolve + weekly persist)', () => {
  it('auto, due: computes from recent days, persists, stamps today', async () => {
    const today = getTodayString();
    recentDocs = [1, 2, 3, 4, 5].map((i) => ({ date: addDays(today, -i), steps: 15000 }));
    const r = await refreshStepGoal('u-auto');
    expect(r?.goal).toBe(9000); // 8000 + capped +1000
    expect(store().today!.stepsGoal).toBe(9000);
    expect(updateDocSpy).toHaveBeenCalledWith({}, {
      'progression.dailyStepGoal': 9000,
      'progression.stepGoalMode': 'auto',
      'progression.stepGoalComputedOn': today,
    });
  });

  it('manual: applies the chosen goal, no write', async () => {
    profile.progression = { stepGoalMode: 'manual', dailyStepGoal: 11000 };
    const r = await refreshStepGoal('u-manual');
    expect(r?.goal).toBe(11000);
    expect(store().today!.stepsGoal).toBe(11000);
    expect(updateDocSpy).not.toHaveBeenCalled();
  });
});

describe('setStepGoalChoice (settings row)', () => {
  it('a number → manual mode on users/{uid}.progression', async () => {
    const goal = await setStepGoalChoice('u-set', 10100);
    expect(goal).toBe(10000);
    expect(updateDocSpy).toHaveBeenCalledWith({}, {
      'progression.dailyStepGoal': 10000,
      'progression.stepGoalMode': 'manual',
    });
    expect(store().today!.stepsGoal).toBe(10000);
  });

  it("'auto' → back to adaptive, recomputed from the current goal", async () => {
    profile.progression = { stepGoalMode: 'manual', dailyStepGoal: 10000 };
    await refreshStepGoal('u-back');
    updateDocSpy.mockClear();
    const goal = await setStepGoalChoice('u-back', 'auto');
    // no recent data → target 8000, capped −1000 from 10000
    expect(goal).toBe(9000);
    expect(profile.progression.stepGoalMode).toBe('auto');
    expect(profile.progression.stepGoalComputedOn).toBe(getTodayString());
  });
});
