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

const getRunWorkoutTemplatesMock = vi.hoisted(() => vi.fn());
const getPaceMapConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../running-admin.service', () => ({
  getRunWorkoutTemplates: getRunWorkoutTemplatesMock,
  getPaceMapConfig: getPaceMapConfigMock,
}));

const generatePlanMock = vi.hoisted(() => vi.fn());

// Partial mock, a deliberate decision, not a side effect (David, 01.09.2026
// review asked explicitly whether this was intentional): fetchAndGenerateActiveRunningProgram
// now calls buildRunningPlan (plan-generator.service.ts), which internally imports
// calibrateBasePace/determineProfileType/generatePlan from THIS SAME module path.
// A full mock (only generatePlan, as the original A1 version had) is not merely
// less-isolated -- it's REQUIRED to change: it would leave calibrateBasePace/
// determineProfileType undefined and crash generateProgramTemplate's real call
// to determineProfileType(goal, basePace) the moment any test exercises this
// path. Keep everything else real via importOriginal, override only
// generatePlan -- same pattern already established in
// onboarding-sync.service.test.ts. Trade-off, stated plainly: these tests now
// exercise the REAL calibrateBasePace/determineProfileType/generateProgramTemplate
// pipeline (less isolated than a full mock), in exchange for actually proving
// buildRunningPlan's wiring works end-to-end rather than only proving the
// mocks were called correctly.
vi.mock('../running-engine.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../running-engine.service')>();
  return { ...actual, generatePlan: generatePlanMock };
});

import {
  fetchAndGenerateActiveRunningProgram,
  buildActiveRunningProgram,
  completeRunningScheduleFirstChoice,
  isRunningPlanBuildStuck,
  hasRunningRebuildInputs,
} from '../running-schedule-write.service';

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

// Matches the REAL RunningProfile.generatedProgramTemplate Pick<> subset --
// the fix commit reads targetDistance/canonicalWeeks/canonicalFrequency
// directly from this (previously only .id was read, to fetch a DIFFERENT,
// never-actually-persisted template -- the bug this commit fixes).
const GENERATED_PROGRAM_TEMPLATE = {
  id: 'tpl_program_1',
  name: 'Couch to 5K',
  targetDistance: '5k' as const,
  canonicalWeeks: 8,
  canonicalFrequency: 3 as const,
  targetProfileTypes: [3],
};

const RUNNING_BASE = {
  isUnlocked: true,
  currentGoal: 'couch_to_5k' as const,
  paceProfile: PACE_PROFILE,
  generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE,
};

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
  getRunWorkoutTemplatesMock.mockReset().mockResolvedValue(WORKOUT_TEMPLATES);
  getPaceMapConfigMock.mockReset().mockResolvedValue({});
  generatePlanMock.mockReset().mockReturnValue(BASE_PLAN_RESULT);
});

describe('fetchAndGenerateActiveRunningProgram', () => {
  it('builds activeProgram from existing paceProfile + generatedProgramTemplate on success -- regenerated in-memory, not fetched by id', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // programId is now freshly generated (generateProgramTemplate's own
      // gen_${dist}_${weeks}w_${freq}x_${Date.now()} id scheme) -- no
      // longer the fixture's old fixed 'tpl_program_1', since nothing is
      // fetched by id anymore. Assert the shape, not an exact value.
      expect(typeof result.activeProgram.programId).toBe('string');
      expect(result.activeProgram.programId.length).toBeGreaterThan(0);
      expect(result.activeProgram.currentWeek).toBe(1);
      expect(typeof result.activeProgram.startDate).toBe('string');
      expect(result.activeProgram.schedule).toHaveLength(1);
    }
    expect(generatePlanMock).toHaveBeenCalled();
  });

  it('passes targetDistance/canonicalFrequency/canonicalWeeks from the stored generatedProgramTemplate through to generation, not a stale/default value', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    await fetchAndGenerateActiveRunningProgram('uid-1');
    const [template] = generatePlanMock.mock.calls[0];
    expect(template.targetDistance).toBe('5k');
    expect(template.canonicalFrequency).toBe(3);
    expect(template.canonicalWeeks).toBe(8);
  });

  it('returns missing-profile-data when paceProfile is absent', async () => {
    state.USER_DOC = { running: { isUnlocked: true, generatedProgramTemplate: GENERATED_PROGRAM_TEMPLATE } };
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'missing-profile-data' });
    expect(generatePlanMock).not.toHaveBeenCalled();
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

  // "program-template-not-found" tests removed here (01.09.2026, fix
  // commit) -- getRunProgramTemplate is no longer called by this function
  // at all (see the module doc's account of the bug this fixed), so
  // nothing in this pipeline can produce that reason anymore. Removed
  // from FetchAndGenerateFailureReason itself, not just unused here.

  it('returns no-workout-templates when getRunWorkoutTemplates resolves empty -- the original deferred-to-first-run trigger', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
  });

  it('maps a getRunWorkoutTemplates REJECTION to no-workout-templates too, matching onboarding-sync.service.ts:1700\'s .catch(()=>[]) semantics', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    getRunWorkoutTemplatesMock.mockRejectedValue(new Error('offline'));
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
  });

  it('falls back to DEFAULT_PACE_MAP_CONFIG when getPaceMapConfig rejects, without failing the whole build', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    getPaceMapConfigMock.mockRejectedValue(new Error('offline'));
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result.ok).toBe(true);
  });

  it('returns generation-threw when generatePlan throws', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    generatePlanMock.mockImplementation(() => { throw new Error('boom'); });
    const result = await fetchAndGenerateActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'generation-threw' });
  });
});

describe('buildActiveRunningProgram', () => {
  it('on success, writes activeProgram and clears planBuildFailedAt via deleteField', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toEqual({ ok: true });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(typeof (payload['running.activeProgram'] as any).programId).toBe('string');
    expect(payload['running.planBuildFailedAt']).toBe('__DELETE_FIELD__');
  });

  it('on a retry-eligible failure with no existing timestamp, writes a fresh planBuildFailedAt AND the specific planBuildFailReason -- distinguishing empty-pool from network failure in production, not just "stuck"', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await buildActiveRunningProgram('uid-1');
    expect(result).toMatchObject({ ok: false, reason: 'no-workout-templates' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(typeof payload['running.planBuildFailedAt']).toBe('string');
    expect(payload['running.planBuildFailReason']).toBe('no-workout-templates');
  });

  it('on success, clears planBuildFailReason alongside planBuildFailedAt', async () => {
    state.USER_DOC = { running: RUNNING_BASE };
    await buildActiveRunningProgram('uid-1');
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.planBuildFailReason']).toBe('__DELETE_FIELD__');
  });

  it('on a repeated failure, does not overwrite the original reason either -- frozen together with the timestamp', async () => {
    state.USER_DOC = {
      running: {
        ...RUNNING_BASE,
        planBuildFailedAt: '2026-08-30T00:00:00.000Z',
        planBuildFailReason: 'generation-threw',
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
        ...RUNNING_BASE,
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
    state.USER_DOC = { running: RUNNING_BASE };
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

describe('completeRunningScheduleFirstChoice', () => {
  const OLD_SCHEDULE = [
    { week: 1, day: 1, workoutId: 'old_w1', status: 'completed' as const, actualPerformance: { avgPace: 300, completionRate: 1 } },
    { week: 6, day: 1, workoutId: 'old_w6', status: 'pending' as const },
  ];

  it('missing-profile-data short-circuits before any write, when paceProfile/generatedProgramTemplate are absent', async () => {
    state.USER_DOC = { running: { isUnlocked: true } };
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    expect(result).toEqual({ ok: false, requiresExplanation: false, reason: 'missing-profile-data' });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('a true first-time choice (no scheduleDaysSource yet -- resolves to system-default) reports requiresExplanation:false', async () => {
    state.USER_DOC = { running: RUNNING_BASE, lifestyle: {} };
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    expect(result).toMatchObject({ ok: true, requiresExplanation: false });
  });

  it('a day-COUNT change from an already user-chosen schedule is a "rebuild" -- requiresExplanation:true', async () => {
    state.USER_DOC = {
      running: { ...RUNNING_BASE, scheduleDays: ['א', 'ג'], scheduleDaysSource: 'user-chosen' },
      lifestyle: {},
    };
    // 2 days -> 3 days: a real count change, not just different days at the same count.
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    expect(result).toMatchObject({ ok: true, requiresExplanation: true });
  });

  it('a same-day-COUNT remap from an already user-chosen schedule is NOT a rebuild -- requiresExplanation:false', async () => {
    state.USER_DOC = {
      running: { ...RUNNING_BASE, scheduleDays: ['א', 'ג', 'ה'], scheduleDaysSource: 'user-chosen' },
      lifestyle: {},
    };
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['ב', 'ד', 'ו'], frequency: 3, time: '07:00' });
    expect(result).toMatchObject({ ok: true, requiresExplanation: false });
  });

  it('on success, writes scheduleDays/scheduleDaysSource/time/activeProgram atomically and clears the failure fields', async () => {
    state.USER_DOC = { running: RUNNING_BASE, lifestyle: {} };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '08:30' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.scheduleDays']).toEqual(['א', 'ג', 'ה']);
    expect(payload['running.scheduleDaysSource']).toBe('user-chosen');
    expect(payload['lifestyle.reminders.runningTime']).toBe('08:30');
    expect(typeof (payload['running.activeProgram'] as any).programId).toBe('string');
    expect(payload['running.planBuildFailedAt']).toBe('__DELETE_FIELD__');
    expect(payload['running.planBuildFailReason']).toBe('__DELETE_FIELD__');
  });

  it('writes lifestyle.reminders.runningTime via a DOTTED PATH, never a nested lifestyle/reminders object -- a sibling field must never be at risk', async () => {
    state.USER_DOC = { running: RUNNING_BASE, lifestyle: {} };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '08:30' });
    const [, payload] = updateDocMock.mock.calls[0];
    expect(Object.keys(payload)).toContain('lifestyle.reminders.runningTime');
    expect(payload['lifestyle']).toBeUndefined();
    expect(payload['lifestyle.reminders']).toBeUndefined();
  });

  it('preserves week 6 (does not reset to week 1) when the existing activeProgram is already on week 6', async () => {
    state.USER_DOC = {
      running: {
        ...RUNNING_BASE,
        scheduleDays: ['א', 'ג'],
        scheduleDaysSource: 'user-chosen',
        activeProgram: { programId: 'p1', startDate: '2026-07-01T00:00:00.000Z', currentWeek: 6, schedule: OLD_SCHEDULE },
      },
      lifestyle: {},
    };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    const [, payload] = updateDocMock.mock.calls[0];
    expect((payload['running.activeProgram'] as any).currentWeek).toBe(6);
  });

  it('merges preserved history into the written activeProgram.schedule -- old completed week 1 entry survives byte-for-byte', async () => {
    state.USER_DOC = {
      running: {
        ...RUNNING_BASE,
        scheduleDays: ['א', 'ג'],
        scheduleDaysSource: 'user-chosen',
        activeProgram: { programId: 'p1', startDate: '2026-07-01T00:00:00.000Z', currentWeek: 6, schedule: OLD_SCHEDULE },
      },
      lifestyle: {},
    };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    const [, payload] = updateDocMock.mock.calls[0];
    const schedule = (payload['running.activeProgram'] as any).schedule;
    expect(schedule).toContainEqual(OLD_SCHEDULE[0]);
  });

  it('on build failure (no workout templates), still writes scheduleDays/scheduleDaysSource/time, writes the failure marker, and does NOT write activeProgram', async () => {
    state.USER_DOC = { running: RUNNING_BASE, lifestyle: {} };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה'], frequency: 3, time: '07:00' });
    expect(result).toMatchObject({ ok: false, buildFailReason: 'no-workout-templates' });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.scheduleDays']).toEqual(['א', 'ג', 'ה']);
    expect(payload['running.scheduleDaysSource']).toBe('user-chosen');
    expect(payload['lifestyle.reminders.runningTime']).toBe('07:00');
    expect(payload['running.activeProgram']).toBeUndefined();
    expect(typeof payload['running.planBuildFailedAt']).toBe('string');
    expect(payload['running.planBuildFailReason']).toBe('no-workout-templates');
  });

  it('on a REPEATED build failure, still writes the day/time choice (unlike buildActiveRunningProgram, which writes nothing on repeat) -- only the failure marker itself is frozen', async () => {
    state.USER_DOC = {
      running: {
        ...RUNNING_BASE,
        planBuildFailedAt: '2026-08-30T00:00:00.000Z',
        planBuildFailReason: 'no-workout-templates',
      },
      lifestyle: {},
    };
    getRunWorkoutTemplatesMock.mockResolvedValue([]);
    const result = await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['ב', 'ד', 'ו'], frequency: 3, time: '07:00' });
    expect(result.ok).toBe(false);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.scheduleDays']).toEqual(['ב', 'ד', 'ו']);
    // The marker itself is NOT refreshed -- absent from this payload entirely,
    // preserving the original '2026-08-30...' already in Firestore.
    expect(payload['running.planBuildFailedAt']).toBeUndefined();
    expect(payload['running.planBuildFailReason']).toBeUndefined();
  });

  it('totalWeeks is preserved from the existing generatedProgramTemplate.canonicalWeeks, never recomputed from the new frequency -- and the new frequency IS passed through, not the old one', async () => {
    state.USER_DOC = { running: { ...RUNNING_BASE, generatedProgramTemplate: { ...GENERATED_PROGRAM_TEMPLATE, canonicalWeeks: 12 } }, lifestyle: {} };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א', 'ג', 'ה', 'ו'], frequency: 4, time: '07:00' });
    // Inspect what actually reached generatePlan -- the mocked function's own
    // first argument is the freshly-generated template, carrying whatever
    // canonicalWeeks/canonicalFrequency completeRunningScheduleFirstChoice
    // passed to buildRunningPlan.
    const [template] = generatePlanMock.mock.calls[0];
    expect(template.canonicalWeeks).toBe(12);
    expect(template.canonicalFrequency).toBe(4);
  });

  it('clamps frequency=1 up to 2 before generation (defense-in-depth via the shared clampRunningFrequency -- the picker itself no longer offers 1 as of 01.09.2026, but this writer must not trust every caller to enforce that)', async () => {
    state.USER_DOC = { running: RUNNING_BASE, lifestyle: {} };
    await completeRunningScheduleFirstChoice({ uid: 'uid-1', scheduleDays: ['א'], frequency: 1, time: '07:00' });
    const [template] = generatePlanMock.mock.calls[0];
    expect(template.canonicalFrequency).toBe(2);
    // scheduleDays itself stays exactly what the user picked (1 day) --
    // only the generated program's structure is clamped, matching signup's
    // own precedented behavior.
    const [, payload] = updateDocMock.mock.calls[0];
    expect(payload['running.scheduleDays']).toEqual(['א']);
  });
});
