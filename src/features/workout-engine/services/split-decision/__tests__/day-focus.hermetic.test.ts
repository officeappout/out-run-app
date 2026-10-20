/**
 * Day focus (enable_home_v2) — generateHomeWorkoutTrio end to end, hermetic (frozen corpus
 * behind the stubbed Firestore, the invariants harness). An intermediate full_body user
 * with 4 strength days (א ב ד ה) is on upper / lower ×4:
 *   flag OFF (option absent / false, switch default) → byte-identical output
 *   flag ON, Sunday (1st strength day)  → only push / pull main exercises, "עליון"
 *   flag ON, Monday (2nd strength day)  → only legs / core main exercises, "תחתון"
 *   flag ON, upper day at home without pull gear → push AND pull in every option (bug 20.10.2026)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('@/lib/firebase', () => import('../../../../../../tests/invariants/hermetic/firebase.stub'));
vi.mock('firebase/firestore', () => import('../../../../../../tests/invariants/hermetic/firestore.stub'));

import { generateHomeWorkoutTrio } from '../../home-workout.service';
import { profileFor, mulberry32, type Scenario } from '../../../../../../tests/invariants/entry-points';
import { strictDomainsOfExercise } from '../../../logic/strict-focus.utils';
import { isSplitDayFocusActive } from '../day-focus.switch';

const FIXED_NOW = new Date('2026-10-18T07:30:00+03:00');
const SUNDAY = '2026-10-18';
const MONDAY = '2026-10-19';
const scenario: Scenario = { id: 'df', entry: 'trio', level: 8, loc: 'home-nogear', minutes: 30, difficulty: 2, program: 'full_body' };

async function run(extra: Record<string, unknown>) {
  Math.random = mulberry32(42);
  const profile = profileFor(scenario) as { lifestyle: Record<string, unknown> };
  profile.lifestyle.scheduleDays = ['א', 'ב', 'ד', 'ה'];
  return generateHomeWorkoutTrio({
    userProfile: profile, location: 'home', testLocation: 'home', availableTime: 30,
    scheduledProgramIds: ['full_body'], skipCycleRestart: true, budgetLightEnabled: false,
    selectedDate: SUNDAY,
    ...extra,
  } as unknown as Parameters<typeof generateHomeWorkoutTrio>[0]);
}

const mainDomains = (trio: Awaited<ReturnType<typeof run>>) =>
  Array.from(new Set(
    trio.options[1].result.workout.exercises
      .filter((e) => (e.exerciseRole ?? 'main') === 'main' && !e.protocolBlock)
      .flatMap((e) => strictDomainsOfExercise(e.exercise)),
  ));

describe('day focus — generateHomeWorkoutTrio (hermetic)', () => {
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

  it('flag OFF → byte-identical: no option = false = the default switch', async () => {
    expect(isSplitDayFocusActive()).toBe(false);
    const a = JSON.stringify(await run({}));
    const b = JSON.stringify(await run({ splitDayFocus: false }));
    expect(b).toBe(a);
    expect(a).not.toContain('"dayFocus"');
  }, 120_000);

  it('flag ON, 1st strength day → upper: push / pull only', async () => {
    const trio = await run({ splitDayFocus: true, selectedDate: SUNDAY });
    const w = trio.options[1].result.workout;
    expect(w.dayFocus).toBe('upper');
    const d = mainDomains(trio);
    expect(d.length).toBeGreaterThan(0);
    for (const x of d) expect(['push', 'pull']).toContain(x === 'push' || x === 'pull' ? x : `off-focus:${x}`);
  }, 120_000);

  it('flag ON, 2nd strength day → lower: legs / core only', async () => {
    const trio = await run({ splitDayFocus: true, selectedDate: MONDAY });
    const w = trio.options[1].result.workout;
    expect(w.dayFocus).toBe('lower');
    const d = mainDomains(trio);
    expect(d.length).toBeGreaterThan(0);
    for (const x of d) expect(['legs', 'core']).toContain(x === 'legs' || x === 'core' ? x : `off-focus:${x}`);
  }, 120_000);

  it('flag ON, a full-body week (3 days) → balanced, the pool is not narrowed', async () => {
    const off = await run({});
    Math.random = mulberry32(42);
    const profile = profileFor(scenario) as { lifestyle: Record<string, unknown> };
    profile.lifestyle.scheduleDays = ['א', 'ג', 'ה'];
    const on = await generateHomeWorkoutTrio({
      userProfile: profile, location: 'home', testLocation: 'home', availableTime: 30,
      scheduledProgramIds: ['full_body'], skipCycleRestart: true, budgetLightEnabled: false,
      selectedDate: SUNDAY, splitDayFocus: true,
    } as unknown as Parameters<typeof generateHomeWorkoutTrio>[0]);
    expect(on.options[1].result.workout.dayFocus).toBe('full');
    expect(mainDomains(on).length).toBeGreaterThan(2);
    expect(off.options[1].result.workout.dayFocus).toBeUndefined();
  }, 120_000);

  // Owner bug 20.10.2026: "the home strength workout is push-only". Home without a bar /
  // rings / TRX / band on an upper day: every tagged pull needs gear, so the strict upper
  // session used to be all push, silently. Now: a gear-free pull (or core) + pullGap.
  it('flag ON, upper day at home with no pull gear → never push-only silently', async () => {
    const trio = await run({ splitDayFocus: true, selectedDate: SUNDAY });
    for (const o of trio.options) {
      const w = o.result.workout;
      const mains = w.exercises.filter((e) => (e.exerciseRole ?? 'main') === 'main' && !e.protocolBlock);
      if (mains.length === 0) continue;
      const d = new Set(mains.flatMap((e) => strictDomainsOfExercise(e.exercise)));
      // Pull present, or the gap is stamped (the overview says why) — and push-only
      // only when nothing else at all fits ('push_only').
      if (!d.has('pull')) expect(w.pullGap).toBeTruthy();
      if (d.size === 1 && d.has('push')) expect(w.pullGap).toBe('push_only');
      if (w.pullGap === 'bodyweight_pull') expect(d.has('pull')).toBe(true);
      // This corpus has gear-free pulls at home (rows / towel work): every option trains both.
      expect(Array.from(d).sort()).toEqual(['pull', 'push']);
      expect(w.pullGap).toBe('bodyweight_pull');
    }
  }, 120_000);
});
