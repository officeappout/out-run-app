/**
 * Client and server agree on a user's step goal: the server path
 * (lib/resolveUserStepGoal → shared/step-goal mirror, reading dailyActivity docs by
 * id) returns exactly what the app's resolver returns for the same
 * progression + days. And the nudge's start/mid/close bucket is computed
 * against that goal (no more 3000 vs 8000 split).
 */
import { describe, it, expect } from 'vitest';
import { resolveUserStepGoal, recentDayDocIds } from '../lib/resolveUserStepGoal';
// The app's own resolver, straight from the client source tree.
import { resolveStepGoal, addDays, type StepDay } from '../../../src/features/activity/lib/step-goal';
import { computeDailyGoalBucket } from '../stepGoalNudgeScheduler';

const TODAY = '2026-10-18';

/** Minimal Firestore stand-in: dailyActivity docs by id, counting reads. */
function fakeDb(uid: string, days: StepDay[]) {
  const byId = new Map(days.map((d) => [`${uid}_${d.date}`, d]));
  const state = { reads: 0 };
  const db = {
    collection: (_name: string) => ({ doc: (id: string) => ({ id }) }),
    getAll: async (...refs: Array<{ id: string }>) => {
      state.reads += refs.length;
      return refs.map((r) => {
        const d = byId.get(r.id);
        return { id: r.id, exists: !!d, data: () => d };
      });
    },
  };
  return { db: db as never, state };
}

const daysOf = (steps: number[]): StepDay[] => steps.map((s, i) => ({ date: addDays(TODAY, -(i + 1)), steps: s }));

const CASES: Array<{ name: string; progression: Record<string, unknown> | undefined; days: StepDay[] }> = [
  { name: 'new user, no data', progression: undefined, days: [] },
  { name: 'legacy 3000, unstamped', progression: { dailyStepGoal: 3000 }, days: daysOf([9000, 9100, 8800]) },
  { name: 'auto due, active walker', progression: {}, days: daysOf([15000, 14000, 16000, 15500, 13000, 0, 12000]) },
  { name: 'auto due, light walker', progression: { dailyStepGoal: 6000, stepGoalComputedOn: addDays(TODAY, -9) }, days: daysOf([2500, 3000, 2800, 3500, 2000]) },
  { name: 'auto fresh', progression: { dailyStepGoal: 7500, stepGoalMode: 'auto', stepGoalComputedOn: addDays(TODAY, -2) }, days: daysOf([20000, 20000, 20000, 20000, 20000]) },
  { name: 'manual', progression: { dailyStepGoal: 14500, stepGoalMode: 'manual' }, days: daysOf([1000, 1000, 1000, 1000, 1000]) },
];

describe('step goal — client and server agree', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const { db } = fakeDb('u1', c.days);
      const server = await resolveUserStepGoal(db, 'u1', c.progression, TODAY);
      const client = resolveStepGoal(c.progression, c.days, TODAY).goal;
      expect(server).toBe(client);
    });
  }

  it('no dailyActivity reads when the goal is manual or freshly stamped', async () => {
    const manual = fakeDb('u1', []);
    await resolveUserStepGoal(manual.db, 'u1', { stepGoalMode: 'manual', dailyStepGoal: 9000 }, TODAY);
    expect(manual.state.reads).toBe(0);
    const fresh = fakeDb('u1', []);
    await resolveUserStepGoal(fresh.db, 'u1', { dailyStepGoal: 9000, stepGoalComputedOn: TODAY }, TODAY);
    expect(fresh.state.reads).toBe(0);
  });

  it('reads the 14 days before today by doc id (same ids the app writes)', () => {
    const ids = recentDayDocIds('u1', TODAY);
    expect(ids).toHaveLength(14);
    expect(ids[0]).toBe('u1_2026-10-17');
    expect(ids[13]).toBe('u1_2026-10-04');
  });
});

describe('nudge buckets use the resolved goal', () => {
  it('5000 steps against the base 8000 goal is mid, not over', async () => {
    const { db } = fakeDb('u1', []);
    const goal = await resolveUserStepGoal(db, 'u1', { dailyStepGoal: 3000 }, TODAY);
    expect(goal).toBe(8000);
    expect(computeDailyGoalBucket(5000, goal)).toBe('mid');
    expect(computeDailyGoalBucket(6000, goal)).toBe('close');
    expect(computeDailyGoalBucket(1000, goal)).toBe('start');
  });
});
