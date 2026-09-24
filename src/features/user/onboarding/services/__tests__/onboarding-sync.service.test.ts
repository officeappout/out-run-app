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

// Mutable so individual tests (Path C / Ghost Purge coverage) can override
// what the resolver reports without needing a real sessionStorage read —
// every OTHER existing test in this file relies on the null/[] defaults
// below, reset in beforeEach.
const pathConfigState = vi.hoisted(() => ({
  programPath: null as string | null,
  cardOrder: [] as string[],
  skillFocus: [] as string[],
  muscleFocus: [] as string[],
  exerciseWishlist: [] as { exerciseId: string; packageKey: string; addedAt: string; source: string }[],
}));

// Real categorization (mirrors assessment-path-config.service.ts's own
// musclesToCategories, not exported directly) — the previous unconditional
// `() => []` stub meant `assessedDomains` was always empty in every test
// that reached the multi-domain-expansion / category-contribution branch,
// so that branch was never actually exercised by any test. Phase 3's combo
// tests below need it real.
const MUSCLE_TO_CATEGORY: Record<string, string> = {
  chest: 'push', shoulders: 'push', triceps: 'push',
  back: 'pull', biceps: 'pull',
  legs: 'legs', glutes: 'legs',
  core: 'core',
};
const PRIMARY_CATEGORIES_MOCK = ['push', 'pull', 'legs', 'core'];
function fakeGetFocusDomainsForMuscleFocus(muscleIds: string[]): string[] {
  if (muscleIds.some((m) => m.toLowerCase() === 'full_body')) return [...PRIMARY_CATEGORIES_MOCK];
  const seen: Record<string, boolean> = {};
  const result: string[] = [];
  for (const m of muscleIds) {
    const lower = m.toLowerCase();
    const cat = PRIMARY_CATEGORIES_MOCK.includes(lower) ? lower : MUSCLE_TO_CATEGORY[lower];
    if (cat && !seen[cat]) { seen[cat] = true; result.push(cat); }
  }
  return result.length > 0 ? result : [...PRIMARY_CATEGORIES_MOCK];
}

vi.mock('@/features/user/onboarding/services/assessment-path-config.service', () => ({
  getProgramPathFromStorage: () => pathConfigState.programPath,
  getProgramPathListFromStorage: () => pathConfigState.cardOrder,
  getMuscleFocusFromStorage: () => pathConfigState.muscleFocus,
  getSkillFocusFromStorage: () => pathConfigState.skillFocus,
  getExerciseWishlistFromStorage: () => pathConfigState.exerciseWishlist,
  deriveActiveProgramFromMuscleFocus: () => 'push',
  deriveActiveProgramFromSkillFocus: (ids: string[]) =>
    ids.length === 1 ? ids[0] : 'calisthenics_upper',
  getFocusDomainsForMuscleFocus: (muscleIds: string[]) => fakeGetFocusDomainsForMuscleFocus(muscleIds),
  // SKILL_TO_FOUNDATION_DOMAIN: planche/handstand/hspu → push; front_lever/
  // muscle_up/one_arm_pullup → pull (matches the real constants file).
  applySkillCollisionSuppression: (categories: string[], skillIds: string[]) => {
    const PUSH_SKILLS = new Set(['planche', 'handstand', 'hspu']);
    const PULL_SKILLS = new Set(['front_lever', 'muscle_up', 'one_arm_pullup']);
    const derived = new Set<string>();
    for (const id of skillIds) {
      if (PUSH_SKILLS.has(id)) derived.add('push');
      if (PULL_SKILLS.has(id)) derived.add('pull');
    }
    if (derived.size === 0) return categories;
    return categories.filter((c) => !derived.has(c));
  },
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
import { generatePlan } from '@/features/workout-engine/core/services/running-engine.service';
import { getRunWorkoutTemplates } from '@/features/workout-engine/core/services/running-admin.service';

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
  pathConfigState.programPath = null;
  pathConfigState.cardOrder = [];
  pathConfigState.skillFocus = [];
  pathConfigState.muscleFocus = [];
  pathConfigState.exerciseWishlist = [];
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

describe('syncOnboardingToFirestore — gap-map finding #9: same-day collision (29.08.2026)', () => {
  // Commit 827450f9 (25.08.2026) fixed the DIFFERENT-days case above — the map-level
  // spread. It explicitly left the SAME-day case unfixed (own commit message: "gap-map
  // finding #9"). "Dana's bug": a strength user picks a running day that already has a
  // strength entry — before this fix, the running write silently replaced that day's
  // whole array, deleting the strength id.
  it("Dana's bug: a strength user picks a running day that already has strength — the strength id survives, both ids present", async () => {
    state.EXISTING_DOC = {
      createdAt: 'X',
      core: { name: 'A', gender: 'other', initialFitnessTier: 1 },
      progression: { globalLevel: 1, globalXP: 0, coins: 0, domains: {}, activePrograms: [], tracks: {} },
      lifestyle: {
        scheduleDays: ['ד'], hasDog: false, commute: { method: 'walk', enableChallenges: false },
        // Dana trains strength on ב, ד, ו — she picks ד for running too.
        recurringTemplate: { 'ב': ['FULL_BODY'], 'ד': ['FULL_BODY'], 'ו': ['FULL_BODY'] },
      },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      running: { isUnlocked: false, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 1,
      runningScheduleDays: ['ד'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    const template = written.lifestyle.recurringTemplate as Record<string, string[]>;

    // Untouched days survive exactly as before.
    expect(template['ב']).toEqual(['FULL_BODY']);
    expect(template['ו']).toEqual(['FULL_BODY']);
    // The colliding day keeps BOTH ids — this is the bug, fixed.
    expect(template['ד']).toEqual(['FULL_BODY', written.running.generatedProgramTemplate.id]);
  });

  it("Dana's bug in reverse: a running user picks a strength day that already has running — the running id survives, both ids present", async () => {
    state.EXISTING_DOC = {
      createdAt: 'X',
      core: { name: 'A', gender: 'other', initialFitnessTier: 1 },
      progression: { globalLevel: 1, globalXP: 0, coins: 0, domains: {}, activePrograms: [], tracks: {} },
      lifestyle: {
        scheduleDays: ['ד'], hasDog: false, commute: { method: 'walk', enableChallenges: false },
        // She already runs on ד — a pre-existing free-form running template id.
        recurringTemplate: { 'ד': ['some_running_template_id_xyz'] },
      },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      running: { isUnlocked: true, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
    stubBrowserStorage(); // no running answers this call — this is a strength-only completion

    // ScheduleStep.tsx's own write shape: a complete strength-only
    // recurringTemplate covering every strength day chosen this session,
    // including one that collides with her existing running day (ד) and one
    // that doesn't (ב).
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      recurringTemplate: { 'ב': ['UPPER_BODY'], 'ד': ['FULL_BODY'] },
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    const template = written.lifestyle.recurringTemplate as Record<string, string[]>;

    // A new, non-colliding strength day is just added.
    expect(template['ב']).toEqual(['UPPER_BODY']);
    // The colliding day keeps BOTH ids — running survives the strength write.
    expect(template['ד']).toEqual(['some_running_template_id_xyz', 'FULL_BODY']);
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

  it('closes doors not yet born: a plain COMPLETED call (no isJitEdit, no goal signal) on an already-tracked user changes nothing — covers callers that never opt into isJitEdit (single-domain-assessment.service.ts, dynamic/page.tsx re-entry)', async () => {
    state.EXISTING_DOC = existingOnboardedUser();
    stubBrowserStorage();

    // No isJitEdit option at all — this is exactly single-domain-assessment.service.ts's
    // and dynamic/page.tsx's call shape: step 'COMPLETED', a payload with no
    // selectedGoalIds/selectedGoal and no assignedResults.
    const ok = await syncOnboardingToFirestore('COMPLETED', {} as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.lifestyle.primaryTrack).toBe('run');
    expect(written.currentProgramId).toBeUndefined();
    expect(written.progression.tracks).toEqual({ planche: { currentLevel: 7, percent: 0 } });
    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'planche' });
  });
});

describe('syncOnboardingToFirestore — primaryTrack/dashboardMode not overwritten when the running bridge completes for an already-tracked user (re-entry, not first-time signup)', () => {
  // 02.09.2026 fix. The existing "closes doors not yet born" test above
  // (line ~462) does NOT cover this: its runningAnswers is null, so the
  // running bridge block never runs, and its fixture's primaryTrack is
  // already 'run' — the exact value the overwrite would have produced
  // anyway, so that assertion couldn't fail even with the bug present.
  // Two real locks, both need to be open: a real (non-'run') existing
  // track, AND real runningAnswers that make the bridge block actually run.

  it('real strength user (primaryTrack derived from derivePrimaryTrack([\'skills\']) = \'strength\', verified not invented) whose running branch completes: primaryTrack/dashboardMode unchanged, proven the bridge block genuinely ran', async () => {
    state.EXISTING_DOC = {
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
        scheduleDays: ['ב', 'ד'], hasDog: false, commute: { method: 'walk', enableChallenges: false },
        // derivePrimaryTrack(['skills']) -> 'strength' -> trackToDashboardMode('strength') -> 'PERFORMANCE'
        // (track-mapper.service.ts) -- a real strength/skills user's actual value, not invented.
        primaryTrack: 'strength', dashboardMode: 'PERFORMANCE',
      },
      equipment: { home: [], office: [], outdoor: [] },
      health: { injuries: [], connectedWatch: 'none' },
      // Internally consistent (unlike existingOnboardedUser() above, logged
      // to parking-lot.md, not fixed here): a real strength user genuinely
      // has running not yet unlocked.
      running: { isUnlocked: false, currentGoal: 'couch_to_5k', activeProgram: null, paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null } },
    };
    // Real runningAnswers, matching health/page.tsx's actual call shape --
    // this is what makes the running bridge block actually execute, not
    // just have the opportunity to.
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ה'],
      runningScheduleTime: '07:00',
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    // Proof the bridge block genuinely ran -- not a no-op skip.
    expect(written.running.isUnlocked).toBe(true);
    expect(written.running.activeProgram).toBeTruthy();

    // The fix: primaryTrack/dashboardMode stay exactly what they were.
    expect(written.lifestyle.primaryTrack).toBe('strength');
    expect(written.lifestyle.dashboardMode).toBe('PERFORMANCE');

    // Existing strength progression untouched too.
    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'planche' });
  });

  it('brand-new user, same-session dual signal (real assignedResults AND running answers together): running still wins primaryTrack/dashboardMode -- the existing policy this fix must not break', async () => {
    // No state.EXISTING_DOC set -- beforeEach defaults it to null (CREATE
    // path, brand-new user, no existing primaryTrack in existingRaw).
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

    expect(written.running.isUnlocked).toBe(true);
    expect(written.running.activeProgram).toBeTruthy();
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body' });

    // Unchanged behavior: a same-session dual-track NEW user still gets
    // routed to the running view, exactly as the block's own long-standing
    // comment describes.
    expect(written.lifestyle.primaryTrack).toBe('run');
    expect(written.lifestyle.dashboardMode).toBe('RUNNING');
  });
});

describe('syncOnboardingToFirestore — 05.09.2026: onboarding uses the shared plan flattener', () => {
  // Commit 890c03c7 added isQualityWorkout/priority to flattenPlanToSchedule's
  // output. onboarding-sync.service.ts had its own hand-duplicated copy of that
  // same flattening logic (predating the function's own extraction) that was
  // never redirected to call it — so a user who onboards through this file
  // never received the two new fields, even though the shared function already
  // produces them. This block proves the redirect: the two mocked deps below
  // (getRunWorkoutTemplates, generatePlan) are overridden per-test with
  // explicit, non-default priority/isQualityWorkout values specifically so a
  // passing assertion means the real value flowed through — not just that an
  // absent field read back as undefined either way.
  it('a new running user receives isQualityWorkout/priority in the saved schedule', async () => {
    vi.mocked(getRunWorkoutTemplates).mockResolvedValueOnce([
      { id: 'tpl_easy_1', category: 'easy', name: 'Easy Run', targetProfileTypes: [2], priority: 1 } as any,
    ]);
    vi.mocked(generatePlan).mockReturnValueOnce({
      plan: {
        weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: true } as any] }],
      },
      warnings: [],
    } as any);
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ג', 'ה'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    const entry = written.running.activeProgram.schedule[0];

    expect(entry.isQualityWorkout).toBe(true);
    expect(entry.priority).toBe(1);
  });

  // 06.09.2026 — verifies the claim, doesn't assume it: onboarding-sync.ts
  // calls the same flattenPlanToSchedule (since d15c5af2) that slotType was
  // just added to, so this SHOULD be automatic — but the routing itself
  // (does this call site's own updateData assembly silently drop the field
  // anywhere between flattenPlanToSchedule's return and the final setDoc)
  // was never actually exercised until this test.
  it('a new running user receives slotType in the saved schedule (same routing as isQualityWorkout/priority)', async () => {
    vi.mocked(getRunWorkoutTemplates).mockResolvedValueOnce([
      { id: 'tpl_long_1', category: 'long_run', name: 'Long Run', targetProfileTypes: [2] } as any,
    ]);
    vi.mocked(generatePlan).mockReturnValueOnce({
      plan: {
        weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_long_1_w1', title: 'Long Run', isQualityWorkout: false, slotType: 'long_run' } as any] }],
      },
      warnings: [],
    } as any);
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ג', 'ה'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.running.activeProgram.schedule[0].slotType).toBe('long_run');
  });

  it('every other schedule field the old inline flatten wrote is still written', async () => {
    // Deliberately the default mocks (no per-test override) — proves this is a
    // pure regression guarantee, not something the fix newly enabled.
    stubBrowserStorage({
      onboarding_running_answers: JSON.stringify({ goalPath: 'start_running', targetDistance: '5k' }),
    });

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      runningWeeklyFrequency: 3,
      runningScheduleDays: ['א', 'ג', 'ה'],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.running.activeProgram).toMatchObject({
      programId: expect.any(String),
      startDate: expect.any(String),
      currentWeek: 1,
    });
    expect(written.running.activeProgram.schedule[0]).toMatchObject({
      week: 1,
      day: 1,
      workoutId: 'tpl_easy_1_w1',
      status: 'pending',
      category: 'easy',
      workoutName: 'Easy Run',
    });
  });
});

describe('syncOnboardingToFirestore — D2 (multi-select program path, Phase 1): a real skills-path core value survives the Ghost Purge', () => {
  it('single-skill selection: a real assessed core level (masterProgramSubLevels.core > 0) is written to progression.tracks.core/domains.core, NOT stripped', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills'];
    pathConfigState.skillFocus = ['planche'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        {
          programId: 'planche',
          levelId: 'planche_level_12',
          masterProgramSubLevels: { push: 0, pull: 0, legs: 0, core: 4 },
        },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.tracks.core).toEqual({ currentLevel: 4, percent: 0 });
    expect(written.progression.domains.core.currentLevel).toBe(4);
    // legs was never assessed (masterProgramSubLevels.legs === 0) — Ghost Purge
    // still correctly strips it; D2 only concerns core.
    expect(written.progression.tracks.legs).toBeUndefined();
  });

  it('multi-skill selection: core survives the masterProgramSubLevels rebuild (regression for the fix that used to silently replace the whole object with just skill-id→level pairs, dropping core)', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills'];
    pathConfigState.skillFocus = ['planche', 'front_lever'];
    stubBrowserStorage();

    const sharedMasterSubLevels = { push: 0, pull: 0, legs: 0, core: 5 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_10', masterProgramSubLevels: sharedMasterSubLevels },
        { programId: 'front_lever', levelId: 'front_lever_level_8', masterProgramSubLevels: sharedMasterSubLevels },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.tracks.core).toEqual({ currentLevel: 5, percent: 0 });
    expect(written.progression.domains.core.currentLevel).toBe(5);
    // the skill sub-levels and their derived foundations still resolve correctly —
    // the fix only ADDS core to the rebuilt object, doesn't disturb the rest.
    expect(written.progression.tracks.planche.currentLevel).toBe(10);
    expect(written.progression.tracks.front_lever.currentLevel).toBe(8);
    expect(written.progression.tracks.push.currentLevel).toBe(19); // 10 + SKILL_TO_FOUNDATION_OFFSET(9)
    expect(written.progression.tracks.pull.currentLevel).toBe(17); // 8 + 9
    expect(written.progression.tracks.legs).toBeUndefined();
  });

  it('regression guard: an unassessed core (masterProgramSubLevels.core === 0) is still purged — D2 only stops the purge for a REAL value, the purge itself is unchanged', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills'];
    pathConfigState.skillFocus = ['planche'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        {
          programId: 'planche',
          levelId: 'planche_level_12',
          masterProgramSubLevels: { push: 0, pull: 0, legs: 0, core: 0 },
        },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.tracks.core).toBeUndefined();
    expect(written.progression.domains.core?.currentLevel ?? 0).toBe(0);
  });
});

describe('syncOnboardingToFirestore — multi-select program path (Phase 1b, piece d): cardFocusOrder / muscleFocusIds persistence', () => {
  it('2+ selected cards: cardFocusOrder is written, in tap order', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills', 'body_focus'];
    pathConfigState.skillFocus = ['planche', 'front_lever'];
    stubBrowserStorage();

    const sharedMasterSubLevels = { push: 0, pull: 0, legs: 0, core: 3 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_5', masterProgramSubLevels: sharedMasterSubLevels },
        { programId: 'front_lever', levelId: 'front_lever_level_4', masterProgramSubLevels: sharedMasterSubLevels },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.cardFocusOrder).toEqual(['skills', 'body_focus']);
  });

  it('exactly 1 selected card: cardFocusOrder is NOT written (no meaningful order)', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills'];
    pathConfigState.skillFocus = ['planche'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_5', masterProgramSubLevels: { push: 0, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.cardFocusOrder).toBeUndefined();
  });

  it('2+ selected muscles: muscleFocusIds is written, in tap order', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.muscleFocus = ['back', 'chest'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'push', levelId: 'push_level_5', masterProgramSubLevels: { push: 5, pull: 6, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.muscleFocusIds).toEqual(['back', 'chest']);
  });

  it('exactly 1 selected muscle: muscleFocusIds is NOT written', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.muscleFocus = ['chest'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'push', levelId: 'push_level_5', masterProgramSubLevels: { push: 5, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.muscleFocusIds).toBeUndefined();
  });
});

describe('syncOnboardingToFirestore — Slice 2b: exerciseWishlist persistence (gated on length > 0, NOT >=2 like its cardFocusOrder/muscleFocusIds siblings)', () => {
  it('1 starred exercise: exerciseWishlist IS written (existence, not order, is what matters here)', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.muscleFocus = ['chest'];
    pathConfigState.exerciseWishlist = [
      { exerciseId: 'pullup', packageKey: 'pull', addedAt: '2026-09-23T00:00:00.000Z', source: 'onboarding' },
    ];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'push', levelId: 'push_level_5', masterProgramSubLevels: { push: 5, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.exerciseWishlist).toEqual([
      { exerciseId: 'pullup', packageKey: 'pull', addedAt: '2026-09-23T00:00:00.000Z', source: 'onboarding' },
    ]);
  });

  it('no starred exercises: exerciseWishlist is NOT written', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.muscleFocus = ['chest'];
    pathConfigState.exerciseWishlist = [];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'push', levelId: 'push_level_5', masterProgramSubLevels: { push: 5, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.exerciseWishlist).toBeUndefined();
  });
});

describe('syncOnboardingToFirestore — Phase 3 (union-based program/track creation): parity — single-card selections stay byte-identical to pre-Phase-3', () => {
  it('Health-only selection stays on the pre-Phase-3 fallthrough — a single combined entry is NOT split into per-domain entries', async () => {
    pathConfigState.programPath = 'health';
    pathConfigState.cardOrder = ['health'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'full_body', levelId: 'full_body_level_5', masterProgramSubLevels: { push: 5, pull: 6, legs: 4, core: 3 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body', templateId: 'full_body' });
    expect(written.progression.tracks.full_body.currentLevel).toBe(5);
    // Individual domains still land in tracks via the generic (unconditional)
    // masterProgramSubLevels loop — pre-Phase-3 behavior too, not new.
    expect(written.progression.tracks.push.currentLevel).toBe(5);
    expect(written.progression.tracks.pull.currentLevel).toBe(6);
    expect(written.progression.tracks.legs.currentLevel).toBe(4);
    expect(written.progression.tracks.core.currentLevel).toBe(3);
    expect(written.progression.skillFocusIds).toBeUndefined();
  });

  it('no card selected (legacy fallback) stays on the pre-Phase-3 fallthrough too', async () => {
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'full_body', levelId: 'full_body_level_3' },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'full_body' });
    expect(written.progression.tracks.full_body.currentLevel).toBe(3);
  });

  it('Body-focus-only, single assessed domain: single push entry (today\'s behavior), no skills contribution', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.cardOrder = ['body_focus'];
    pathConfigState.muscleFocus = ['chest'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'push', levelId: 'push_level_7', masterProgramSubLevels: { push: 7, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.activePrograms).toHaveLength(1);
    expect(written.progression.activePrograms[0]).toMatchObject({ id: 'push', templateId: 'push' });
    expect(written.progression.tracks.push.currentLevel).toBe(7);
    expect(written.progression.skillFocusIds).toBeUndefined();
  });

  it('Body-focus-only, multi-domain: one entry per assessed domain (today\'s behavior)', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.cardOrder = ['body_focus'];
    pathConfigState.muscleFocus = ['chest', 'back'];
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'upper_body', levelId: 'upper_body_level_1', masterProgramSubLevels: { push: 8, pull: 6, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;
    expect(written.progression.activePrograms).toHaveLength(2);
    expect(written.progression.activePrograms.map((p: any) => p.id).sort()).toEqual(['pull', 'push']);
    expect(written.progression.tracks.push.currentLevel).toBe(8);
    expect(written.progression.tracks.pull.currentLevel).toBe(6);
  });
});

describe('syncOnboardingToFirestore — Phase 3 (union-based program/track creation): combos — the actual bug fix + Decisions 1-3', () => {
  it('THE HEADLINE BUG FIX: body_focus primary + skills secondary (2+ skills) — both a tracked muscle program AND a tracked skill program are written, skillFocusIds present', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.cardOrder = ['body_focus', 'skills'];
    pathConfigState.muscleFocus = ['legs']; // → 'legs' category, no collision with the push/pull-deriving skills below
    pathConfigState.skillFocus = ['planche', 'front_lever'];
    stubBrowserStorage();

    const shared = { push: 0, pull: 0, legs: 9, core: 0 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_10', masterProgramSubLevels: shared },
        { programId: 'front_lever', levelId: 'front_lever_level_8', masterProgramSubLevels: shared },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    // Skill contribution: a tracked skill program (calisthenics_upper generalist).
    expect(written.progression.skillFocusIds).toEqual(['planche', 'front_lever']);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'calisthenics_upper')).toBe(true);
    expect(written.progression.tracks.planche.currentLevel).toBe(10);
    expect(written.progression.tracks.front_lever.currentLevel).toBe(8);
    // Skill contribution is built first — deterministic regardless of tap order.
    expect(written.currentProgramId).toBe('calisthenics_upper');

    // Category (muscle) contribution: the co-selected body_focus leg track —
    // previously silently dropped because skills was the secondary card.
    expect(written.progression.activePrograms.some((p: any) => p.id === 'legs')).toBe(true);
    expect(written.progression.tracks.legs.currentLevel).toBe(9);
    expect(written.progression.muscleFocusIds).toBeUndefined(); // only 1 muscle selected, below the >=2 threshold
  });

  it('order-independence: skills primary + body_focus secondary produces IDENTICAL output to the reversed tap order above', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills', 'body_focus']; // reversed vs the headline case above
    pathConfigState.muscleFocus = ['legs'];
    pathConfigState.skillFocus = ['planche', 'front_lever'];
    stubBrowserStorage();

    const shared = { push: 0, pull: 0, legs: 9, core: 0 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_10', masterProgramSubLevels: shared },
        { programId: 'front_lever', levelId: 'front_lever_level_8', masterProgramSubLevels: shared },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.skillFocusIds).toEqual(['planche', 'front_lever']);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'calisthenics_upper')).toBe(true);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'legs')).toBe(true);
    expect(written.progression.tracks.planche.currentLevel).toBe(10);
    expect(written.progression.tracks.front_lever.currentLevel).toBe(8);
    expect(written.progression.tracks.legs.currentLevel).toBe(9);
    expect(written.currentProgramId).toBe('calisthenics_upper');
  });

  it('Decision 3: a push-deriving skill suppresses the redundant same-domain category entry — the skill is the sole source of truth for that domain', async () => {
    pathConfigState.programPath = 'body_focus';
    pathConfigState.cardOrder = ['body_focus', 'skills'];
    pathConfigState.muscleFocus = ['chest']; // → 'push', SAME domain as planche below
    pathConfigState.skillFocus = ['planche']; // specialist, push-deriving
    stubBrowserStorage();

    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_12', masterProgramSubLevels: { push: 0, pull: 0, legs: 0, core: 0 } },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    // No redundant standalone 'push' program — planche is the sole source for push.
    expect(written.progression.activePrograms.some((p: any) => p.id === 'push')).toBe(false);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'planche')).toBe(true);
    // planche's own SKILL_TO_FOUNDATION_OFFSET derivation still populates the push track (12 + 9).
    expect(written.progression.tracks.push.currentLevel).toBe(21);
  });

  it('Decision 1: Health co-selected with Skills (no Body Focus) still contributes its non-suppressed categories', async () => {
    pathConfigState.programPath = 'health';
    pathConfigState.cardOrder = ['health', 'skills'];
    pathConfigState.skillFocus = ['planche']; // push-deriving specialist
    stubBrowserStorage();

    const shared = { push: 0, pull: 5, legs: 4, core: 3 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_10', masterProgramSubLevels: shared },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    // Skill contribution.
    expect(written.progression.activePrograms.some((p: any) => p.id === 'planche')).toBe(true);
    // Health's other 3 categories still assessed and expanded — push suppressed (planche owns it).
    expect(written.progression.activePrograms.some((p: any) => p.id === 'push')).toBe(false);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'pull')).toBe(true);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'legs')).toBe(true);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'core')).toBe(true);
    expect(written.progression.tracks.pull.currentLevel).toBe(5);
    expect(written.progression.tracks.legs.currentLevel).toBe(4);
    expect(written.progression.tracks.core.currentLevel).toBe(3);
  });

  it('Decision 2: a generalist SKILLS-ONLY (no other card) selection preserves a genuinely-assessed legs value from the primary result — not just core (D2\'s original narrower scope)', async () => {
    pathConfigState.programPath = 'skills';
    pathConfigState.cardOrder = ['skills'];
    pathConfigState.skillFocus = ['planche', 'front_lever'];
    stubBrowserStorage();

    // legs=6 simulates a real frontend-computed baseline (Phase 2's
    // baselineSkillMasterSubLevels generalization) — NOT reachable through
    // category contribution here, since no body_focus/health card is selected.
    const shared = { push: 0, pull: 0, legs: 6, core: 0 };
    const ok = await syncOnboardingToFirestore('COMPLETED', {
      assignedResults: [
        { programId: 'planche', levelId: 'planche_level_5', masterProgramSubLevels: shared },
        { programId: 'front_lever', levelId: 'front_lever_level_4', masterProgramSubLevels: shared },
      ],
    } as any);

    expect(ok).toBe(true);
    const written = setDocMock.mock.calls[0][1] as any;

    expect(written.progression.tracks.legs.currentLevel).toBe(6);
    // No category contribution fired at all — 'legs' is not a standalone activeProgram;
    // the value only reached `tracks` via Decision 2's carry-over into calisthenics_upper's
    // own masterProgramSubLevels rebuild.
    expect(written.progression.activePrograms.some((p: any) => p.id === 'legs')).toBe(false);
    expect(written.progression.activePrograms.some((p: any) => p.id === 'calisthenics_upper')).toBe(true);
  });
});

// P0-2 (24.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.23): proves
// the actual scenario, not just the fix's mechanism in isolation — two
// parallel writers (useOnboardingStore's debounced "light" write, and a
// page's real completion "heavy" write) racing on the same user doc, in
// BOTH possible arrival orders. `skipProgressFields` (the light write's new
// option) means the light write's payload never contains onboardingStep/
// onboardingStatus at all — simulated here with a real shallow merge
// (Object.assign) onto an accumulated doc, which is exactly how Firestore's
// own `merge: true` behaves for top-level scalar fields, the only kind
// these two fields are.
describe('syncOnboardingToFirestore — P0-2: onboardingStatus/onboardingStep race', () => {
  it('light write lands AFTER the heavy COMPLETED write — COMPLETED survives (the actual bug scenario)', async () => {
    stubBrowserStorage();
    const finalDoc: Record<string, unknown> = {};

    const heavyOk = await syncOnboardingToFirestore('COMPLETED', { core: { name: 'Dana' } } as any);
    expect(heavyOk).toBe(true);
    Object.assign(finalDoc, setDocMock.mock.calls[0][1]);
    expect(finalDoc.onboardingStatus).toBe('COMPLETED');

    setDocMock.mockClear();
    const lightOk = await syncOnboardingToFirestore(
      'PERSONA',
      { scheduleDays: ['א'] } as any,
      { skipProgressFields: true },
    );
    expect(lightOk).toBe(true);
    const lightPayload = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(lightPayload).not.toHaveProperty('onboardingStep');
    expect(lightPayload).not.toHaveProperty('onboardingStatus');
    Object.assign(finalDoc, lightPayload);

    // The light write landing last must NOT have reverted the status.
    expect(finalDoc.onboardingStatus).toBe('COMPLETED');
    expect(finalDoc.onboardingStep).toBe('COMPLETED');
  });

  it('light write lands BEFORE the heavy COMPLETED write — COMPLETED still lands correctly (the normal order)', async () => {
    stubBrowserStorage();
    const finalDoc: Record<string, unknown> = {};

    const lightOk = await syncOnboardingToFirestore(
      'PERSONA',
      { scheduleDays: ['א'] } as any,
      { skipProgressFields: true },
    );
    expect(lightOk).toBe(true);
    Object.assign(finalDoc, setDocMock.mock.calls[0][1]);
    // The light write alone never claims a status at all.
    expect(finalDoc.onboardingStatus).toBeUndefined();
    expect(finalDoc.onboardingStep).toBeUndefined();

    setDocMock.mockClear();
    const heavyOk = await syncOnboardingToFirestore('COMPLETED', { core: { name: 'Dana' } } as any);
    expect(heavyOk).toBe(true);
    Object.assign(finalDoc, setDocMock.mock.calls[0][1]);

    expect(finalDoc.onboardingStatus).toBe('COMPLETED');
    expect(finalDoc.onboardingStep).toBe('COMPLETED');
  });

  it('without skipProgressFields (pre-fix call shape), the light write DOES clobber a completed status — pins the bug this fix closes', async () => {
    stubBrowserStorage();
    const finalDoc: Record<string, unknown> = { onboardingStatus: 'COMPLETED', onboardingStep: 'COMPLETED' };

    // Same call the store used to make, with no options at all.
    await syncOnboardingToFirestore('PERSONA', { scheduleDays: ['א'] } as any);
    const payload = setDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.onboardingStatus).toBe('ONBOARDING'); // the old, unconditional behavior
    Object.assign(finalDoc, payload);

    expect(finalDoc.onboardingStatus).toBe('ONBOARDING'); // reverted — this is the bug, pinned
  });
});
