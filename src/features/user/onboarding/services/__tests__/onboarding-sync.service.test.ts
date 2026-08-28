import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pins two bug fixes in syncOnboardingToFirestore('COMPLETED', ...), both found by the
// 22.08.2026 running-questionnaire gap-map audit:
//
//  Bug 1 — a running-only user's first COMPLETED call fell through to the GOAL_TO_PROGRAM
//          fallback and got a phantom `full_body` strength program written to
//          progression.domains/tracks/activePrograms, because the skip-check read
//          `updateData.running?.isUnlocked` before the RUNNING IMPROVEMENT BRIDGE block
//          (further down in the same function) ever set it true.
//  Bug 2 — the running bridge's own `lifestyle.recurringTemplate` write replaced the whole
//          field instead of merging, silently deleting a returning strength user's training
//          days from the calendar.
//
// No existing test exercised this file at all before this — see the gap-map's tests-agent
// report. This mocks every transitive dependency by hand, matching the established
// getDistanceLeaderboard.test.ts / exercise-history.batch.test.ts convention (vi.hoisted
// mutable state + inline vi.mock factories), since there is no shared Firestore test-utils
// helper anywhere in this repo.

const state = vi.hoisted(() => ({
  EXISTING_DOC: null as Record<string, any> | null,
}));

const setDocMock = vi.hoisted(() =>
  vi.fn(async (_ref: unknown, _data: Record<string, unknown>, _opts?: unknown) => undefined),
);

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'test-uid-1', isAnonymous: true } })),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, uid: string) => ({ __uid: uid }),
  setDoc: setDocMock,
  getDoc: vi.fn(async () => ({
    exists: () => state.EXISTING_DOC !== null,
    data: () => state.EXISTING_DOC ?? undefined,
  })),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {
    constructor(public ms: number) {}
    static now() { return new FakeTimestamp(Date.now()); }
  },
}));

vi.mock('@/features/analytics/AnalyticsService', () => ({
  Analytics: {
    logOnboardingCompleted: vi.fn(async () => undefined),
    logOnboardingStepComplete: vi.fn(async () => undefined),
  },
}));

vi.mock('@/config/feature-flags', () => ({ IS_COIN_SYSTEM_ENABLED: false }));

vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: {
    getState: () => ({ profile: null }),
    setState: vi.fn(),
  },
}));

vi.mock('@/features/user/progression/services/progression.service', () => ({
  recalculateAncestorMasters: vi.fn(async () => undefined),
}));

vi.mock('@/features/user/onboarding/services/branching-logic.service', () => ({
  loadAssessmentContext: () => null,
}));

vi.mock('@/features/user/onboarding/services/assessment-path-config.service', () => ({
  getProgramPathFromStorage: () => null,
  getMuscleFocusFromStorage: () => [],
  getSkillFocusFromStorage: () => [],
  deriveActiveProgramFromMuscleFocus: () => 'push',
  deriveActiveProgramFromSkillFocus: () => 'calisthenics_upper',
  getFocusDomainsForMuscleFocus: () => [],
}));

vi.mock('@/features/user/onboarding/services/access-code.service', () => ({
  getAccessCodeResult: () => null,
  clearAccessCodeResult: vi.fn(),
}));

vi.mock('@/features/content/programs', () => ({
  getProgramByTemplateId: vi.fn(async (id: string) => ({ id, maxLevels: 25 })),
}));

// Dynamic-import target inside onboarding-sync.service.ts for CMS maxLevels — made to
// throw deliberately, exercising the file's own EMERGENCY_FALLBACK_DOMAIN_MAX_LEVELS path
// (a real, already-defined constant in the source, includes full_body: 25) instead of
// needing a full CMS-programs fixture.
vi.mock('@/features/content/programs/core/program.service', () => ({
  getAllPrograms: vi.fn(async () => { throw new Error('mocked: no CMS in test'); }),
}));

vi.mock('@/lib/marketingAttribution', () => ({
  buildAttributionPayload: () => ({ source: 'test', medium: 'test' }),
}));

vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({
  triggerKellyWelcomeBot: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firestore.service', () => ({
  updateUserAuthority: vi.fn(async () => true),
}));

vi.mock('@/features/workout-engine/core/services/running-admin.service', () => ({
  getPaceMapConfig: vi.fn(async () => ({})),
  getRunWorkoutTemplates: vi.fn(async () => [
    { id: 'tpl_easy_1', category: 'easy', name: 'Easy Run', targetProfileTypes: [2] },
  ]),
}));

// Partial mock — keep the real calibrateBasePace (pure, and it's what
// running-onboarding-bridge.service.ts imports internally), fake only generatePlan
// (the heavy week-by-week materializer) with a small fixed plan so the test doesn't need
// a full workout-template/pace-map fixture to produce real schedule content.
vi.mock('@/features/workout-engine/core/services/running-engine.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/workout-engine/core/services/running-engine.service')>();
  return {
    ...actual,
    generatePlan: vi.fn(() => ({
      plan: { weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run' }] }] },
      warnings: [],
    })),
  };
});

import { syncOnboardingToFirestore } from '../onboarding-sync.service';

function stubBrowserStorage(values: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(values));
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  vi.stubGlobal('window', {});
  vi.stubGlobal('sessionStorage', fakeStorage);
}

beforeEach(() => {
  state.EXISTING_DOC = null;
  setDocMock.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncOnboardingToFirestore — Bug 1: phantom full_body strength program', () => {
  it('pure-running new user (CREATE path, real health/page.tsx call shape): no full_body anywhere, activePrograms empty', async () => {
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ד'],
      runningScheduleTime: '07:00',
    } as any);

    expect(ok).toBe(true);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.activePrograms).toEqual([]);
    expect(Object.keys(written.progression.domains ?? {})).not.toContain('full_body');
    expect(Object.keys(written.progression.tracks ?? {})).not.toContain('full_body');
    // running actually unlocked — the fallback wasn't just silently dropped
    expect(written.running.isUnlocked).toBe(true);
  });

  it('pure-strength new user (CREATE path, real assessment-visual call shape): real assignedResults program is written, untouched by the fix', async () => {
    stubBrowserStorage(); // no running answers this session

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'full_body', levelId: 'full_body_level_5' },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body', templateId: 'full_body' });
    expect(written.progression.tracks.full_body.currentLevel).toBe(5);
    // no running bridge ran
    expect(written.running?.isUnlocked ?? false).toBe(false);
  });

  it('pure-strength returning user (UPDATE path, real health/page.tsx empty-payload call shape): zero change to the already-assigned program', async () => {
    state.EXISTING_DOC = {
      createdAt: 'X',
      core: { name: 'A', gender: 'other', initialFitnessTier: 2 },
      progression: {
        globalLevel: 1, globalXP: 0, coins: 0, domains: {}, activePrograms: [
          { id: 'full_body', templateId: 'full_body', name: 'full body', startDate: 'X', durationWeeks: 52, currentWeek: 1, focusDomains: ['full_body'] },
        ],
        tracks: { full_body: { currentLevel: 5, percent: 0 } },
      },
      lifestyle: { scheduleDays: [], hasDog: false, commute: { method: 'walk', enableChallenges: false } },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      running: { isUnlocked: false, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
    stubBrowserStorage(); // no assignedResults, no running answers this call — matches health/page.tsx's second, empty COMPLETED call for a strength user

    const ok = await syncOnboardingToFirestore('COMPLETED', {} as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body', templateId: 'full_body' });
    expect(written.progression.tracks.full_body.currentLevel).toBe(5);
  });

  it('hybrid single-call (real assignedResults AND running answers together): real assessed program AND running plan both land, fallback never fires', async () => {
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [{ programId: 'full_body', levelId: 'full_body_level_3' }],
      runningWeeklyFrequency: 4,
      runningScheduleDays: ['ב'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body' });
    expect(written.progression.tracks.full_body.currentLevel).toBe(3);
    expect(written.running.isUnlocked).toBe(true);
    expect(written.running.activeProgram).toBeTruthy();
  });
});

describe('syncOnboardingToFirestore — Bug 2: lifestyle.recurringTemplate merge', () => {
  it('returning strength user completing running on different days: old AND new day-keys both present, value shape unchanged', async () => {
    state.EXISTING_DOC = {
      createdAt: 'X',
      core: { name: 'A', gender: 'other', initialFitnessTier: 1 },
      progression: { globalLevel: 1, globalXP: 0, coins: 0, domains: {}, activePrograms: [], tracks: {} },
      lifestyle: {
        scheduleDays: ['א'], hasDog: false, commute: { method: 'walk', enableChallenges: false },
        recurringTemplate: { 'א': ['FULL_BODY'] },
      },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      running: { isUnlocked: false, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['ד'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    const template = written.lifestyle.recurringTemplate as Record<string, string[]>;

    // old strength day survives ...
    expect(template['א']).toEqual(['FULL_BODY']);
    // ... and the new running day is present, same [templateId] shape as before the fix
    expect(template['ד']).toEqual([written.running.generatedProgramTemplate.id]);
  });

  it('pure-running new user, no pre-existing recurringTemplate: identical to pre-fix behavior (only the running day)', async () => {
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['ב'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    const template = written.lifestyle.recurringTemplate as Record<string, string[]>;

    expect(Object.keys(template)).toEqual(['ב']);
    expect(template['ב']).toEqual([written.running.generatedProgramTemplate.id]);
  });
});

describe('syncOnboardingToFirestore — JIT edit: COMPLETED-only side effects must not re-run', () => {
  // 28.08.2026 fix: OnboardingWizard's handleJITSave always calls
  // syncOnboardingToFirestore('COMPLETED', data) for a single-field JIT edit
  // (equipment, weight, schedule, ...), with `data` starting empty (no
  // selectedGoalIds, no assignedResults). Before this fix, that silently reset
  // lifestyle.primaryTrack to 'health' (Persona Engine) and currentProgramId to
  // 'full_body' (GOAL_TO_PROGRAM fallback, consumed as priority-1 by
  // useProgressionSync.ts over the correct activePrograms[0].id) on every JIT
  // save. The `{ isJitEdit: true }` option gates those blocks off while keeping
  // onboardingStep/onboardingStatus correctly 'COMPLETED'.
  function existingOnboardedUser() {
    return {
      createdAt: 'X',
      core: { name: 'A', gender: 'other', initialFitnessTier: 2 },
      progression: {
        globalLevel: 4, globalXP: 500, coins: 10,
        domains: { planche: { currentLevel: 7, maxLevel: 25, isUnlocked: true } },
        tracks: { planche: { currentLevel: 7, percent: 0 } },
        activePrograms: [
          { id: 'planche', templateId: 'planche', name: 'planche', startDate: 'X', durationWeeks: 52, currentWeek: 1, focusDomains: ['planche'] },
        ],
      },
      currentProgramId: 'planche',
      onboardingStatus: 'COMPLETED',
      onboardingCompletedAt: 'ORIGINAL_COMPLETION_TIMESTAMP',
      lifestyle: {
        scheduleDays: ['א'], hasDog: false, commute: { method: 'walk', enableChallenges: false },
        primaryTrack: 'run', dashboardMode: 'RUNNING',
      },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      running: { isUnlocked: false, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
  }

  it('JIT equipment edit: primaryTrack, currentProgramId, and progression are byte-identical to before; status still COMPLETED', async () => {
    state.EXISTING_DOC = existingOnboardedUser();
    stubBrowserStorage(); // fresh JIT session — no sessionStorage context, matches handleJITSave's real shape

    const ok = await syncOnboardingToFirestore(
      'COMPLETED',
      { equipment: { home: ['pull_up_bar'], office: [], outdoor: [] } } as any,
      { isJitEdit: true },
    );

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    // onboardingStep/onboardingStatus must still be correct — an already-onboarded
    // user must not get routed back into the wizard.
    expect(written.onboardingStep).toBe('COMPLETED');
    expect(written.onboardingStatus).toBe('COMPLETED');

    // The two confirmed-live bugs this fix closes:
    expect(written.lifestyle.primaryTrack).toBe('run'); // not silently reset to 'health'
    expect(written.currentProgramId).toBeUndefined(); // not silently reset to 'full_body'

    // Nothing about progression changed either (Program & Level Assignment fully skipped).
    expect(written.progression.tracks).toEqual({ planche: { currentLevel: 7, percent: 0 } });
    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'planche' });

    // Business-metric side effects must not fire on a JIT edit.
    expect(written.onboardingCompletedAt).toBeUndefined();
    expect(written.marketingAttribution).toBeUndefined();
  });

  it('JIT schedule edit on a dual-track user: dashboardMode also untouched (Persona Engine fully skipped, not just primaryTrack)', async () => {
    state.EXISTING_DOC = existingOnboardedUser();
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore(
      'COMPLETED',
      { scheduleDays: ['ב', 'ד'], recurringTemplate: { 'ב': ['planche'], 'ד': ['planche'] } } as any,
      { isJitEdit: true },
    );

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.lifestyle.primaryTrack).toBe('run');
    expect(written.lifestyle.dashboardMode).toBe('RUNNING');
  });
});
