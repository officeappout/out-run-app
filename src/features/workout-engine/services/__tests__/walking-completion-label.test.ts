/**
 * REGRESSION — walking sessions labelled as running (FIXED, routes phase 1.4).
 *
 * Promoted from the Stage-2 diagnostic (_verify-walking-mislabel-bugs, which
 * proved by execution that useRunningPlayer sent workoutType:'running' /
 * displayIcon:'run-fast' unconditionally on finish, so a completed WALK was
 * written to dailyProgress as a run and fed into the running weekly-volume
 * tracker). The fix: useRunningPlayer now takes both labels from
 * aerobicCompletionLabels(activityType). These tests lock that in:
 *   1. source-fact: the player no longer contains the hardcoded literals and
 *      does call aerobicCompletionLabels;
 *   2. execution: the labels it produces for a walk / run go through the REAL
 *      (unmocked) completion pipeline and land correctly in Firestore.
 * Cycling is out of scope and deliberately unchanged ('running'/'run-fast').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: unknown[]) => ({ __refPath: args.slice(1).join('/') })),
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  onSnapshot: vi.fn(() => () => {}),
  increment: vi.fn((n: number) => ({ __increment: n })),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'verify-walk-uid' } },
}));

vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: { id: 'verify-walk-uid' } }) },
}));

vi.mock('@/lib/firestore.service', () => ({
  getUserProgression: vi.fn(async () => null),
}));

vi.mock('@/lib/awardWorkoutXP', () => ({
  awardWorkoutXP: vi.fn(async () => ({})),
}));

vi.mock('@/features/activity/store/useActivityStore', () => ({
  useActivityStore: {
    getState: () => ({
      logWorkout: vi.fn(),
      logMultiCategoryWorkout: vi.fn(),
      currentStreak: 3,
    }),
  },
}));

const recordRunningSession = vi.fn();
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: { getState: () => ({ recordRunningSession }) },
}));

vi.mock('@/lib/healthBridge/init', () => ({
  writeWorkoutToHealth: vi.fn(async () => undefined),
}));

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

describe('Source-fact check (mechanical): useRunningPlayer derives completion labels from activityType; the share text is fixed', () => {
  it('FIXED — useRunningPlayer no longer hardcodes workoutType:\'running\' / displayIcon:\'run-fast\' on finish', () => {
    const filePath = path.join(
      REPO_ROOT,
      'src/features/workout-engine/players/running/store/useRunningPlayer.ts',
    );
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(src).not.toContain(`workoutType: 'running'`);
    expect(src).not.toContain(`displayIcon: 'run-fast'`);
    expect(src).toContain('aerobicCompletionLabels(activityType)');
    expect(src).toContain('workoutType: completionLabels.workoutType');
    expect(src).toContain('displayIcon: completionLabels.displayIcon');
  });

  // FIXED (16.10.2026): the share-text half of this bug is gone. The old proof
  // asserted FreeRunSummary.tsx:179's hardcoded "🏃 סיימתי אימון ריצה חופשית! …
  // #ריצה" literal, which a finished WALK also shared. FreeRunSummary was
  // retired (history now renders AerobicSummaryView too, so every walk/run
  // summary — live and history — shares via AerobicShareBlock). Promoted to a
  // regression test of the FIXED behaviour: the one remaining share text is
  // activity-neutral, so a walk can no longer be shared as a run.
  it('FIXED — summary share text no longer hardcodes "running" (FreeRunSummary retired; AerobicShareBlock is activity-neutral)', () => {
    const legacyPath = path.join(
      REPO_ROOT,
      'src/features/workout-engine/players/running/components/FreeRun/FreeRunSummary.tsx',
    );
    expect(fs.existsSync(legacyPath)).toBe(false);

    const sharePath = path.join(
      REPO_ROOT,
      'src/features/workout-engine/summary/components/aerobic/AerobicShareBlock.tsx',
    );
    const lines = fs.readFileSync(sharePath, 'utf-8').split('\n');
    // Located by CONTENT, not line number.
    const shareLines = lines.filter((l) => l.includes('סיימתי אימון'));
    expect(shareLines).toHaveLength(1);
    const shareLine = shareLines[0];
    // No running-specific wording (the bug): not "ריצה", not "#ריצה", no 🏃.
    expect(shareLine).not.toContain('ריצה');
    expect(shareLine).not.toContain('🏃');
    // Still the generic workout message with the distance interpolated.
    expect(shareLine).toContain('${distanceStr}');
  });
});

describe('Execution: a completed WALKING session is written to Firestore as walking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // markTodayAsCompleted() early-returns on `typeof window === 'undefined'`
    // (SSR guard) — this repo's vitest config is node-env with no jsdom, so
    // without these stubs the real action under test would never run at
    // all. completion-sync.service.ts also touches sessionStorage +
    // window.dispatchEvent behind the same guard (celebration-mode flag) —
    // stubbed as no-ops since only the Firestore write is under test here.
    (globalThis as unknown as { window: unknown }).window = { dispatchEvent: vi.fn() };
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = { setItem: vi.fn() };
  });

  it('aerobicCompletionLabels: walking → walking/walk; running and cycling unchanged (running/run-fast)', async () => {
    const { aerobicCompletionLabels } = await import(
      '@/features/workout-engine/services/completion-sync.service'
    );
    expect(aerobicCompletionLabels('walking')).toEqual({ workoutType: 'walking', displayIcon: 'walk' });
    expect(aerobicCompletionLabels('running')).toEqual({ workoutType: 'running', displayIcon: 'run-fast' });
    // Cycling is out of scope — behaviour deliberately unchanged.
    expect(aerobicCompletionLabels('cycling')).toEqual({ workoutType: 'running', displayIcon: 'run-fast' });
    expect(aerobicCompletionLabels(undefined)).toEqual({ workoutType: 'running', displayIcon: 'run-fast' });
  });

  it('a WALK finished through the player\'s labels runs the REAL completion pipeline and is written as walking (not running)', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { syncWorkoutCompletion, aerobicCompletionLabels } = await import(
      '@/features/workout-engine/services/completion-sync.service'
    );

    // Same shape useRunningPlayer sends on finish, with labels from the fix.
    const labels = aerobicCompletionLabels('walking');
    await syncWorkoutCompletion({
      workoutType: labels.workoutType,
      durationMinutes: 22,
      calories: 140,
      activityCategory: 'cardio',
      displayIcon: labels.displayIcon,
      distanceKm: 1.8,
    });

    // The walk must NOT be recorded into the RUNNING weekly-volume tracker.
    expect(recordRunningSession).not.toHaveBeenCalled();

    const setDocMock = setDoc as unknown as { mock: { calls: unknown[][] } };
    const dailyProgressCall = setDocMock.mock.calls.find(
      (call) => JSON.stringify(call[1]).includes('workoutType'),
    );
    expect(dailyProgressCall).toBeDefined();
    const written = dailyProgressCall![1] as Record<string, unknown>;
    expect(written.workoutType).toBe('walking');
    expect(written.displayIcon).toBe('walk');
  });

  it('a RUN still records into the running weekly-volume tracker and is written as running', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { syncWorkoutCompletion, aerobicCompletionLabels } = await import(
      '@/features/workout-engine/services/completion-sync.service'
    );
    const labels = aerobicCompletionLabels('running');
    await syncWorkoutCompletion({
      workoutType: labels.workoutType,
      durationMinutes: 22,
      calories: 140,
      activityCategory: 'cardio',
      displayIcon: labels.displayIcon,
      distanceKm: 3.2,
    });
    expect(recordRunningSession).toHaveBeenCalledWith(3.2, 22);
    const setDocMock = setDoc as unknown as { mock: { calls: unknown[][] } };
    const written = setDocMock.mock.calls.find(
      (call) => JSON.stringify(call[1]).includes('workoutType'),
    )![1] as Record<string, unknown>;
    expect(written.workoutType).toBe('running');
    expect(written.displayIcon).toBe('run-fast');
  });

  it('control: the real pipeline labels a literal walking payload correctly', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { syncWorkoutCompletion } = await import(
      '@/features/workout-engine/services/completion-sync.service'
    );

    await syncWorkoutCompletion({
      workoutType: 'walking',
      durationMinutes: 22,
      calories: 140,
      activityCategory: 'cardio',
      displayIcon: 'walk',
      distanceKm: 1.8,
    });

    // Control: recordRunningSession must NOT fire for a correctly-tagged walk.
    expect(recordRunningSession).not.toHaveBeenCalled();

    const setDocMock = setDoc as unknown as { mock: { calls: unknown[][] } };
    const dailyProgressCall = setDocMock.mock.calls.find(
      (call) => JSON.stringify(call[1]).includes('workoutType'),
    );
    const written = dailyProgressCall![1] as Record<string, unknown>;

    expect(written.workoutType).toBe('walking');
    expect(written.displayIcon).toBe('walk'); // proves getWorkoutIcon('walking') really does map correctly — bug is isolated to the origination point, not the pipeline
  });
});
