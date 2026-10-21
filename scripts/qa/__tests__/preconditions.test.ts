import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isDemoTenantId } from '@/lib/demo';
import { loadPersonasAndMissions, testerStates } from '../lib/files';
import { PRECONDITIONS, preconditionConflicts, type Precondition } from '../lib/seed/preconditions';
import { buildTesterState, rotateWeekToToday } from '../lib/seed/tester-state';
import { runAnswersFor, runningProfileFor } from '../lib/seed/run-plan';
import type { DemoWeek } from '../../demo/lib/schedule';
import type { RunWorkoutTemplate } from '@/features/workout-engine/core/types/running.types';

// Wednesday 21.10.2026, 18:30 local.
const NOW = new Date(2026, 9, 21, 18, 30);
const TODAY = '2026-10-21';
const WHO = { name: 'נועה', age: 31, gender: 'female' as const };

const userOf = (docs: ReturnType<typeof buildTesterState>, uid: string) => docs.find((d) => d.path === `users/${uid}`)!.data as Record<string, any>;
const todayEntries = (docs: ReturnType<typeof buildTesterState>, uid: string) =>
  ((docs.find((d) => d.path === `userSchedule/${uid}_${TODAY}`)?.data.entries as Array<Record<string, unknown>>) ?? []);

describe('mission preconditions', () => {
  it('every mission file declares a known precondition, and a shared account never has two states', () => {
    const { missions } = loadPersonasAndMissions();
    for (const m of missions) expect(PRECONDITIONS, m.id).toContain(m.precondition);
    expect(preconditionConflicts(testerStates(missions))).toEqual([]);
  });

  it('onboarding missions start fresh; home / player / progress missions start seeded', () => {
    const { missions } = loadPersonasAndMissions();
    const pre = Object.fromEntries(missions.map((m) => [m.id, m.precondition]));
    expect(pre.D01_onboard_strength).toBe('fresh');
    expect(pre.D02_onboard_run).toBe('fresh');
    expect(pre.D03_onboard_walk).toBe('fresh');
    expect(pre.M01_walker58).toBe('fresh');
    for (const id of ['D04_home_states', 'D05_strength_player', 'D06_run_player', 'D07_walk_player', 'D08_schedule_agenda', 'D09_map_routes', 'D10_progress', 'D11_profile_settings', 'D12_community', 'M02_runner_intervals', 'M03_home_beginner']) {
      expect(pre[id], id).not.toBe('fresh');
    }
  });

  it('flags two missions asking different states of one account', () => {
    expect(
      preconditionConflicts([
        { mission: 'A', uid: 'demo_qa_x', precondition: 'fresh' },
        { mission: 'B', uid: 'demo_qa_x', precondition: 'strength_plan' },
      ]),
    ).toHaveLength(1);
  });
});

describe('buildTesterState', () => {
  // The generated running program id carries Date.now() (as in the app) — pin the clock.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => vi.useRealTimers());
  it('fresh = nothing to write (the reset is the state)', () => {
    expect(buildTesterState('demo_qa_ds_strength_se', 'fresh', WHO, NOW, null)).toEqual([]);
  });

  it('refuses a non-tester uid', () => {
    expect(() => buildTesterState('demo_tlv01', 'strength_plan', WHO, NOW, null)).toThrow();
    expect(() => buildTesterState('realUser123456789012', 'strength_plan', WHO, NOW, null)).toThrow();
  });

  const seeded = PRECONDITIONS.filter((p): p is Exclude<Precondition, 'fresh'> => p !== 'fresh');
  for (const pre of seeded) {
    it(`${pre}: an onboarded demo profile with only the tester's own docs`, () => {
      const uid = `demo_qa_t_${pre}`.slice(0, 48);
      const docs = buildTesterState(uid, pre, WHO, NOW, null);
      for (const d of docs) {
        const id = d.path.split('/')[1];
        expect(id === uid || id.startsWith(`${uid}_`), d.path).toBe(true);
        expect(d.path.startsWith('feed_posts/') || d.path.startsWith('sessions/'), d.path).toBe(false);
      }
      const u = userOf(docs, uid);
      expect(u.onboardingStatus).toBe('COMPLETED');
      expect(u.onboardingComplete).toBe(true);
      expect(u.healthDeclarationAccepted).toBe(true);
      expect(u.isMockData).toBe(true);
      expect(u.core.isMockData).toBe(true);
      expect(u.core.discoverable).toBe(false);
      expect(isDemoTenantId(u.core.tenantId)).toBe(true);
      expect(u.core.demo).toMatchObject({ tester: true, precondition: pre });
      expect(u.core.name).toBe('נועה');
      expect(u.lifestyle.dashboardMode).toBeTruthy();
      // a session today (the week is rotated so it falls on today)
      expect(todayEntries(docs, uid).length, 'session today').toBeGreaterThan(0);
      // some history
      expect(docs.some((d) => d.path.startsWith(`dailyActivity/${uid}_`))).toBe(true);
      // deterministic (idempotent re-seed)
      const again = buildTesterState(uid, pre, WHO, NOW, null);
      expect(again.map((d) => d.path)).toEqual(docs.map((d) => d.path));
      expect(userOf(again, uid)).toEqual(u);
    });
  }

  it('strength_plan: a strength program with a level, today = strength, not done yet', () => {
    const uid = 'demo_qa_ds_str_plan_i13';
    const docs = buildTesterState(uid, 'strength_plan', WHO, NOW, null);
    const u = userOf(docs, uid);
    expect(u.progression.activePrograms.map((p: { templateId: string }) => p.templateId)).toEqual(['full_body']);
    expect(u.progression.tracks.full_body.currentLevel).toBeGreaterThan(0);
    expect(u.lifestyle.primaryTrack).toBe('strength');
    const today = todayEntries(docs, uid);
    expect(today.some((e) => (e.scheduledCategories as string[]).includes('strength'))).toBe(true);
    expect(today.every((e) => e.completed === false)).toBe(true);
    expect(u.equipment).toEqual({ home: [], office: [], outdoor: [] });
  });

  it('strength_after_workout: today\'s workout is done, in the past, with its workout doc', () => {
    const uid = 'demo_qa_ds_str_done_i13';
    const docs = buildTesterState(uid, 'strength_after_workout', WHO, NOW, null);
    const today = todayEntries(docs, uid);
    expect(today.length).toBeGreaterThan(0);
    expect(today.every((e) => e.completed === true && typeof e.completedWorkoutId === 'string')).toBe(true);
    for (const e of today) {
      const w = docs.find((d) => d.path === `workouts/${e.completedWorkoutId}`);
      expect(w).toBeTruthy();
      expect((w!.data.date as Date).getTime()).toBeLessThan(NOW.getTime());
    }
  });

  it('run_plan: a runner with the onboarding\'s running block and a run today', () => {
    const uid = 'demo_qa_runner_plan';
    const docs = buildTesterState(uid, 'run_plan', { name: 'אורי', age: 34, gender: 'male' }, NOW, null);
    const u = userOf(docs, uid);
    expect(u.lifestyle.primaryTrack).toBe('run');
    expect(u.running).toMatchObject({ isUnlocked: true, scheduleDaysSource: 'user-chosen' });
    expect(u.running.generatedProgramTemplate.id).toBeTruthy();
    expect(u.running.paceProfile.basePace).toBeGreaterThan(0);
    expect(u.running.activeProgram).toBeUndefined(); // no templates passed
    // run days carry the SAME generated program id (recurringTemplate, like the onboarding)
    const runId = u.running.generatedProgramTemplate.id;
    for (const letter of u.running.scheduleDays) expect(u.lifestyle.recurringTemplate[letter]).toContain(runId);
    expect(todayEntries(docs, uid).some((e) => (e.scheduledCategories as string[]).includes('cardio'))).toBe(true);
  });

  it('walk_plan: a walker with a walking goal and a walk today', () => {
    const uid = 'demo_qa_ds_walk_plan_i13';
    const docs = buildTesterState(uid, 'walk_plan', WHO, NOW, null);
    const u = userOf(docs, uid);
    expect(u.lifestyle.walkingGoal).toBeTruthy();
    expect(todayEntries(docs, uid).length).toBeGreaterThan(0);
  });

  it('all_tracks: strength + running + a walking goal', () => {
    const uid = 'demo_qa_ds_all_i13';
    const u = userOf(buildTesterState(uid, 'all_tracks', WHO, NOW, null), uid);
    expect(u.progression.activePrograms.length).toBeGreaterThan(0);
    expect(u.running?.isUnlocked).toBe(true);
    expect(u.lifestyle.walkingGoal).toBeTruthy();
    expect(u.lifestyle.primaryTrack).toBe('hybrid');
  });
});

describe('rotateWeekToToday', () => {
  const week: DemoWeek = {
    days: [[], [{ kind: 'strength', minutes: 40, window: 'evening' }], [], [{ kind: 'run', minutes: 30, window: 'evening' }], [], [], []],
    source: 'test',
    strengthSlugs: ['full_body'],
    running: { targetDistance: '10k', level: 'x', days: [3] },
  };
  it('moves the first session of the kind onto today, keeping the spacing', () => {
    const r = rotateWeekToToday(week, 5, 'strength');
    expect(r.days[5][0].kind).toBe('strength');
    expect(r.days[0][0].kind).toBe('run');
    expect(r.running!.days).toEqual([0]);
  });
  it('is a no-op when already on today or the kind is missing', () => {
    expect(rotateWeekToToday(week, 1, 'strength')).toBe(week);
    expect(rotateWeekToToday(week, 1, 'walk')).toBe(week);
  });
});

describe('run plan answers', () => {
  it('an improving runner gives a reference pace; the profile carries the onboarding fields', () => {
    const input = { targetDistance: '10k', goalPath: 'improve_time', weeklyFrequency: 4, scheduleDays: ['א', 'ג', 'ה', 'ו'] };
    expect(runAnswersFor(input)).toMatchObject({ goalPath: 'improve_time', targetDistance: '10k', abilityTier: 'runner', paceInputSeconds: 3000, weeklyFrequency: 4 });
    const { running: r, programId } = runningProfileFor(input, { templates: [], paceMap: null }, NOW);
    expect(programId).toBe((r.generatedProgramTemplate as { id: string }).id);
    expect(r.scheduleDays).toEqual(['א', 'ג', 'ה', 'ו']);
    expect(r.activeProgram).toBeUndefined();
  });
  it('with the running templates it generates the program like the onboarding (activeProgram.schedule)', () => {
    const cats = ['easy_run', 'long_run', 'short_intervals', 'long_intervals', 'tempo', 'fartlek_structured', 'strides'] as const;
    const templates = cats.map((category, k) => ({ id: `tpl_${k}`, name: category, category, isQualityWorkout: !['easy_run', 'long_run'].includes(category), targetProfileTypes: [1, 2, 3], blocks: [] })) as unknown as RunWorkoutTemplate[];
    const input = { targetDistance: '10k', goalPath: 'improve_time', weeklyFrequency: 4, scheduleDays: ['א', 'ג', 'ה', 'ו'] };
    const { running, programId } = runningProfileFor(input, { templates, paceMap: null }, NOW);
    const ap = running.activeProgram as { programId: string; currentWeek: number; schedule: unknown[] };
    expect(ap.programId).toBe(programId);
    expect(ap.currentWeek).toBe(1);
    expect(ap.schedule.length).toBeGreaterThan(0);
  });
});

describe('tester reset fences', () => {
  it('refuses any uid that is not demo_qa_* before touching the database', async () => {
    const { planTesterReset, executeTesterReset } = await import('../lib/seed/reset');
    const db = new Proxy({}, { get: () => { throw new Error('db touched'); } }) as never;
    await expect(planTesterReset(db, 'demo_tlv01')).rejects.toThrow(/non-tester/);
    await expect(planTesterReset(db, 'someRealUid1234567890')).rejects.toThrow(/non-tester/);
    await expect(executeTesterReset(db, { uid: 'demo_tlv01', deletes: ['users/demo_tlv01'], skipped: [] })).rejects.toThrow(/non-tester/);
  });
});
