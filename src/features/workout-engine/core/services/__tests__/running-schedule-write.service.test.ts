import { describe, it, expect, vi, beforeEach } from 'vitest';

// A1 of the "spinner: false promise, no recovery" fix
// (idempotent-booping-sunrise.md, 01.09.2026 second round). Mocking
// convention matches onboarding-sync.service.test.ts (vi.hoisted mutable
// state + inline vi.mock factories — no shared Firestore test-utils helper
// exists in this repo).

const state = vi.hoisted(() => ({
  USER_DOC: null as Record<string, any> | null,
  DOC_EXISTS: true,
}));

const updateDocMock = vi.hoisted(() =>
  vi.fn(async (_ref: unknown, _data: Record<string, unknown>) => undefined),
);
const getDocMock = vi.hoisted(() =>
  vi.fn(async () => ({
    exists: () => state.DOC_EXISTS,
    data: () => state.USER_DOC ?? undefined,
  })),
);

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, uid: string) => ({ __uid: uid }),
  getDoc: getDocMock,
  updateDoc: updateDocMock,
  deleteField: () => '__DELETE_FIELD__',
}));

const getRunProgramTemplateMock = vi.hoisted(() => vi.fn());
const getRunWorkoutTemplatesMock = vi.hoisted(() => vi.fn());
const getPaceMapConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../running-admin.service', () => ({
  getRunProgramTemplate: getRunProgramTemplateMock,
  getRunWorkoutTemplates: getRunWorkoutTemplatesMock,
  getPaceMapConfig: getPaceMapConfigMock,
}));

const generatePlanMock = vi.hoisted(() => vi.fn());

vi.mock('../running-engine.service', () => ({
  generatePlan: generatePlanMock,
}));

import {
  fetchAndGenerateActiveRunningProgram,
  buildActiveRunningProgram,
  isRunningPlanBuildStuck,
  hasRunningRebuildInputs,
} from '../running-schedule-write.service';
import { flattenPlanToSchedule } from '../plan-generator.service';

const FULL_TEMPLATE = {
  id: 'tpl_program_1',
  name: 'Couch to 5K',
  targetDistance: '5k' as const,
  targetProfileTypes: [3],
  canonicalWeeks: 8,
  canonicalFrequency: 3 as const,
  weekTemplates: [],
  progressionRules: [],
};

const WORKOUT_TEMPLATES = [
  { id: 'tpl_easy_1', name: 'Easy Run', category: 'easy_run', isQualityWorkout: false, targetProfileTypes: [3], blocks: [] },
];

const PACE_PROFILE = {
  basePace: 400,
  profileType: 3 as const,
  qualityWorkoutsHistory: [],
  qualityWorkoutCount: 0,
  lastSelfCorrectionDate: null,
};

const GENERATED_PROGRAM_TEMPLATE = { id: 'tpl_program_1', name: 'Couch to 5K' };

const BASE_PLAN_RESULT = {
  plan: {
    id: 'plan_1',
    name: 'Couch to 5K',
    targetDistance: '5k' as const,
    durationWeeks: 1,
    weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: false, blocks: [] }] }],
  },
  warnings: [],
  intensityBreakdown: [],
};

beforeEach(() => {
  state.USER_DOC = null;
  state.DOC_EXISTS = true;
  updateDocMock.mockClear();
  getDocMock.mockClear();
  getRunProgramTemplateMock.mockReset().mockResolvedValue(FULL_TEMPLATE);
  getRunWorkoutTemplatesMock.mockReset().mockResolvedValue(WORKOUT_TEMPLATES);
  getPaceMapConfigMock.mockReset().mockResolvedValue({});
  generatePlanMock.mockReset().mockReturnValue(BASE_PLAN_RESULT);
});

describe('flattenPlanToSchedule', () => {
  it('flattens a single week/single workout into one schedule entry, day 1-indexed', () => {
    const schedule = flattenPlanToSchedule(BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
    expect(schedule).toEqual([
      { week: 1, day: 1, workoutId: 'tpl_easy_1_w1', status: 'pending', category: 'easy_run', workoutName: 'Easy Run' },
    ]);
  });

  it('flattens multiple weeks and multiple workouts per week, day index resets each week', () => {
    const planResult = {
      ...BASE_PLAN_RESULT,
      plan: {
        ...BASE_PLAN_RESULT.plan,
        weeks: [
          { weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: false, blocks: [] }, { id: 'tpl_easy_1_w1', title: 'Easy Run 2', isQualityWorkout: false, blocks: [] }] },
          { weekNumber: 2, workouts: [{ id: 'tpl_easy_1_w2', title: 'Easy Run', isQualityWorkout: false, blocks: [] }] },
        ],
      },
    };
    const schedule = flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any);
    expect(schedule.map((s) => [s.week, s.day])).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  it('strips the _w{N} suffix to look up template metadata', () => {
    const schedule = flattenPlanToSchedule(BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
    expect(schedule[0].category).toBe('easy_run');
    expect(schedule[0].workoutName).toBe('Easy Run');
  });

  it('falls back to the workout.title when the template id is not in the pool', () => {
    const planResult = {
      ...BASE_PLAN_RESULT,
      plan: {
        ...BASE_PLAN_RESULT.plan,
        weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_unknown_w1', title: 'Fallback Title', isQualityWorkout: false, blocks: [] }] }],
      },
    };
    const schedule = flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any);
    expect(schedule[0].workoutName).toBe('Fallback Title');
    expect(schedule[0].category).toBeUndefined();
  });

  it('returns an empty schedule for a plan with no weeks', () => {
    const planResult = { ...BASE_PLAN_RESULT, plan: { ...BASE_PLAN_RESULT.plan, weeks: [] } };
    expect(flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any)).toEqual([]);
  });
});

describe('fetchAndGenerateActiveRunningProgram', () => {
  it('builds activeProgram from existing paceProfile + generatedProgramTemplate on success', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.activeProgram.programId).toBe('tpl_program_1');
      expect(result.activeProgram.currentWeek).toBe(1);
      expect(typeof result.activeProgram.startDate).toBe('string');
      expect(result.activeProgram.schedule).toHaveLength(1);
    }
    expect(getRunProgramTemplateMock).toHaveBeenCalledWith('tpl_program_1');
  });

  it('returns missing-profile-data when paceProfile is absent', async () => {
    state.USER_DOC = { running: { isUnlocked: true, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data' });
    expect(getRunProgramTemplateMock).not.toHaveBeenCalled();
  });

  it('returns missing-profile-data when generatedProgramTemplate is absent', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE } };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data' });
  });

  it('returns missing-profile-data when the user document does not exist', async () => {
    state.DOC_EXISTS = false;
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data' });
  });

  it('surfaces existingPlanBuildFailedAt on a missing-profile-data failure', async () => {
    state.USER_DOC = { running: { isUnlocked: true, planBuildFailedAt: '2026-08-30T00:00:00.000Z' } };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data', existingPlanBuildFailedAt: '2026-08-30T00:00:00.000Z' });
  });

  it('returns program-template-not-found when getRunProgramTemplate resolves null', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getRunProgramTemplateMock.mockResolvedValue(null);
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'program-template-not-found' });
  });

  it('returns no-workout-templates when getRunWorkoutTemplates resolves empty -- the original deferred-to-first-run trigger', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
  });

  it('maps a getRunWorkoutTemplates REJECTION to no-workout-templates too, matching onboarding-sync.service.ts:1700\'s .catch(()=>[]) semantics', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getRunWorkoutTemplatesMock.mockRejectedValue(new Error('offline'));
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
  });

  it('a getRunProgramTemplate REJECTION does NOT fold into program-template-not-found -- it is a distinct, uncaught failure (generation-threw)', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getRunProgramTemplateMock.mockRejectedValue(new Error('offline'));
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'generation-threw' });
  });

  it('falls back to DEFAULT_PACE_MAP_CONFIG when getPaceMapConfig rejects, without failing the whole build', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getPaceMapConfigMock.mockRejectedValue(new Error('offline'));
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result.ok).toBe(true);
  });

  it('returns generation-threw when generatePlan throws', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    generatePlanMock.mockImplementation(() => { throw new Error('boom'); });
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'generation-threw' });
  });

  // Superseded by "maps a getRunWorkoutTemplates REJECTION to
  // no-workout-templates too" above — a getRunWorkoutTemplates() rejection
  // is now deliberately caught (.catch(() => []), matching
  // onboarding-sync.service.ts:1700), NOT left to fall through to
  // generation-threw. This old expectation is exactly what David's review
  // flagged as unverified in the previous round.
});

describe('buildActiveRunningProgram', () => {
  it('on success, writes activeProgram and clears planBuildFailedAt via deleteField', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toEqual({ ok: true });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.activeProgram']).toMatchObject({ programId: 'tpl_program_1' });
    expect(payload['running.planBuildFailedAt']).toBe('__DELETE_FIELD__');
  });

  it('on a retry-eligible failure with no existing timestamp, writes a fresh planBuildFailedAt AND the specific planBuildFailReason -- distinguishing empty-pool from network failure in production, not just "stuck"', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(typeof payload['running.planBuildFailedAt']).toBe('string');
    expect(payload['running.planBuildFailReason']).toBe('no-workout-templates');
  });

  it('on success, clears planBuildFailReason alongside planBuildFailedAt', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    await buildActiveRunningProgram('uid-1');
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.planBuildFailReason']).toBe('__DELETE_FIELD__');
  });

  it('on a repeated failure, does not overwrite the original reason either -- frozen together with the timestamp', async () => {
    state.USER_DOC = {
      running: {
        isUnlocked: true,
        paceProfile: PACE_PROFILE,
        generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE,
        planBuildFailedAt: '2026-08-30T00:00:00.000Z',
        planBuildFailReason: 'program-template-not-found',
      },
    };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('on a repeated failure, does NOT overwrite an existing planBuildFailedAt -- "stuck since" beats "last attempted"', async () => {
    state.USER_DOC = {
      running: {
        isUnlocked: true,
        paceProfile: PACE_PROFILE,
        generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE,
        planBuildFailedAt: '2026-08-30T00:00:00.000Z',
      },
    };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('on missing-profile-data, never writes planBuildFailedAt -- that field promises a retry is available, which is not true here', async () => {
    state.USER_DOC = { running: { isUnlocked: true } };
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data' });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('returns generation-threw if the success write itself throws', async () => {
    state.USER_DOC = { running: { isUnlocked: true, paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    updateDocMock.mockRejectedValueOnce(new Error('write failed'));
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'generation-threw' });
  });
});

describe('isRunningPlanBuildStuck', () => {
  it('is true when isUnlocked is true and activeProgram is absent -- the deferred-to-first-run state, no marker required', () => {
    expect(isRunningPlanBuildStuck({ running: { isUnlocked: true } })).toBe(true);
  });

  it('is false when activeProgram is present, regardless of isUnlocked', () => {
    expect(isRunningPlanBuildStuck({ running: { isUnlocked: true, activeProgram: { programId: 'p1', schedule: [] } } })).toBe(false);
  });

  it('is false when isUnlocked is not true -- user never finished running onboarding', () => {
    expect(isRunningPlanBuildStuck({ running: { isUnlocked: false } })).toBe(false);
    expect(isRunningPlanBuildStuck({ running: {} })).toBe(false);
  });

  it('is false for a missing running namespace or a null/undefined profile', () => {
    expect(isRunningPlanBuildStuck({})).toBe(false);
    expect(isRunningPlanBuildStuck(null)).toBe(false);
    expect(isRunningPlanBuildStuck(undefined)).toBe(false);
  });

  it('does not depend on planBuildFailedAt at all -- stuck even for a user who never triggered a retry (the exact circularity this fixes)', () => {
    // No planBuildFailedAt anywhere in this profile -- isRunningPlanBuildStuck
    // must still correctly report "stuck," since detection never reads that field.
    const neverRetriedProfile = { running: { isUnlocked: true } };
    expect('planBuildFailedAt' in neverRetriedProfile.running).toBe(false);
    expect(isRunningPlanBuildStuck(neverRetriedProfile)).toBe(true);
  });
});

describe('hasRunningRebuildInputs', () => {
  it('is true when both paceProfile and generatedProgramTemplate.id are present', () => {
    expect(hasRunningRebuildInputs({ running: { paceProfile: PACE_PROFILE, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } })).toBe(true);
  });

  it('is false when paceProfile is missing', () => {
    expect(hasRunningRebuildInputs({ running: { generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } })).toBe(false);
  });

  it('is false when generatedProgramTemplate is missing', () => {
    expect(hasRunningRebuildInputs({ running: { paceProfile: PACE_PROFILE } })).toBe(false);
  });

  it('is false when generatedProgramTemplate is present but has no id', () => {
    expect(hasRunningRebuildInputs({ running: { paceProfile: PACE_PROFILE, generatedProgramTemplate: {} } })).toBe(false);
  });

  it('is false for a missing running namespace or a null/undefined profile', () => {
    expect(hasRunningRebuildInputs({})).toBe(false);
    expect(hasRunningRebuildInputs(null)).toBe(false);
    expect(hasRunningRebuildInputs(undefined)).toBe(false);
  });
});
