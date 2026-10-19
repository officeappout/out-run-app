/**
 * Budget light mode — generateHomeWorkoutTrio end to end, hermetic (frozen corpus behind the
 * stubbed Firestore, same harness as the invariants gate). A user whose weekly strength budget
 * is spent (remaining 3 sets):
 *   flag OFF            → the old recovery floor (stretch "התאוששות" ×3) — unchanged
 *   flag ON, recommended → a real, lighter strength session with the "why" description
 *   flag ON, manual      → the builder's own session, no budget restriction, no light stamp
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('@/lib/firebase', () => import('../../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../../tests/invariants/hermetic/firestore.stub'));

import { generateHomeWorkoutTrio } from '../../services/home-workout.service';
import { profileFor, mulberry32, type Scenario } from '../../../../../tests/invariants/entry-points';
import { mainWorkSets } from '../cap-sets';
import { LIGHT_SESSION_SETS_CAP } from '../policy';

const FIXED_NOW = new Date('2026-10-18T07:30:00+03:00');
const scenario: Scenario = { id: 'bl', entry: 'trio', level: 6, loc: 'home-nogear', minutes: 30, difficulty: 2, program: 'full_body' };

async function run(extra: Record<string, unknown>) {
  Math.random = mulberry32(42);
  const profile = profileFor(scenario);
  // Program started a month ago (the mock starts it "now" → the first-week stale-budget bypass).
  const ap = (profile as { progression?: { activePrograms?: Array<{ startDate?: Date }> } }).progression?.activePrograms?.[0];
  if (ap) ap.startDate = new Date(FIXED_NOW.getTime() - 30 * 86_400_000);
  return generateHomeWorkoutTrio({
    userProfile: profile, location: 'home', testLocation: 'home', availableTime: 30,
    scheduledProgramIds: ['full_body'], skipCycleRestart: true, remainingWeeklyBudget: 3, weeklyBudgetUsagePercent: 92,
    ...extra,
  } as Parameters<typeof generateHomeWorkoutTrio>[0]);
}

describe('budget light mode — generateHomeWorkoutTrio (hermetic)', () => {
  const quiet: Record<string, unknown> = {};
  const realRandom = Math.random;
  beforeAll(() => {
    process.env.TZ = 'Asia/Jerusalem';
    process.env.WORKOUT_ENGINE_FIXED_SHUFFLE_SEED = '42';
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] });
    globalThis.fetch = (async () => { throw new Error('network disabled'); }) as typeof fetch;
    for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table'] as const) {
      quiet[k] = console[k]; (console as unknown as Record<string, unknown>)[k] = () => {};
    }
  });
  afterAll(() => {
    Math.random = realRandom;
    vi.useRealTimers();
    for (const [k, v] of Object.entries(quiet)) (console as unknown as Record<string, unknown>)[k] = v;
  });

  it('flag OFF → the old recovery floor, exactly as before', async () => {
    const trio = await run({ budgetLightEnabled: false });
    expect(trio.isRestDay).toBe(true);
    for (const o of trio.options) {
      expect(o.result.workout.isRecovery).toBe(true);
      expect(o.result.workout.budgetLight).toBeUndefined();
    }
  }, 60_000);

  it('flag ON, recommended → lighter real strength with the "why"', async () => {
    const trio = await run({ budgetLightEnabled: true });
    expect(trio.isRestDay).toBe(false);
    const w = trio.options[1].result.workout;
    expect(w.isRecovery).toBe(false);
    expect(w.budgetLight).toEqual({ reasonKey: 'budget_light.weekly_spent', setsCap: LIGHT_SESSION_SETS_CAP });
    expect(w.description).toContain('השבוע כבר עשית את רוב הכוח');
    expect(w.difficulty).toBe(1);
    const mains = w.exercises.filter((e) => (e.exerciseRole ?? 'main') === 'main');
    expect(mains.length).toBeGreaterThan(0);
    expect(mainWorkSets(w.exercises)).toBeLessThanOrEqual(LIGHT_SESSION_SETS_CAP);
  }, 60_000);

  it('flag ON, manual (builder) → no recovery floor, no light cap', async () => {
    const trio = await run({ budgetLightEnabled: true, isManualOverride: true, targetDifficulty: 2, difficulty: 2 });
    const w = trio.options[0].result.workout;
    expect(w.isRecovery).toBe(false);
    expect(w.budgetLight).toBeUndefined();
    expect(w.exercises.some((e) => (e.exerciseRole ?? 'main') === 'main')).toBe(true);
  }, 60_000);

  it('flag ON, recommended, budget NOT spent → no light stamp', async () => {
    const trio = await run({ budgetLightEnabled: true, remainingWeeklyBudget: 40, weeklyBudgetUsagePercent: 10 });
    for (const o of trio.options) expect(o.result.workout.budgetLight).toBeUndefined();
  }, 60_000);
});
