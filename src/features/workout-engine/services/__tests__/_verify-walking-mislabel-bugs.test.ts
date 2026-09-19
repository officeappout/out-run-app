/**
 * DIAGNOSTIC — Stage 2 field-test verification, not a permanent regression
 * suite (yet). Proves by EXECUTION, not by reading, two bugs found in
 * docs/field-test/01-walking-flow-map.md:
 *
 *   1. useRunningPlayer.ts:1848,1852 sends workoutType:'running' /
 *      displayIcon:'run-fast' UNCONDITIONALLY on session finish — including
 *      for a completed WALKING session.
 *   2. That literal survives, unmodified, all the way into the REAL
 *      (unmocked) markTodayAsCompleted() action's Firestore write —
 *      confirmed by running the actual production code with only the true
 *      I/O boundary (Firestore SDK, Firebase auth) mocked.
 *
 * David's instruction (19.09.2026): verify via execution, do not fix yet.
 * Delete or promote to a real regression test once the fix lands.
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

describe('Source-fact check (mechanical, not eyeballed): the two literals really are unconditional', () => {
  it('useRunningPlayer.ts:1848 and :1852 are bare string literals with zero reference to activityType', () => {
    const filePath = path.join(
      REPO_ROOT,
      'src/features/workout-engine/players/running/store/useRunningPlayer.ts',
    );
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    // Lines are 1-indexed in the editor; array is 0-indexed.
    const line1848 = lines[1847];
    const line1852 = lines[1851];
    expect(line1848).toContain(`workoutType: 'running'`);
    expect(line1852).toContain(`displayIcon: 'run-fast'`);
    // The bug's precondition: neither line references the real activityType
    // variable that holds 'walking' — if it did, this assertion would fail
    // the moment someone "fixes" it by accident without updating this test.
    expect(line1848).not.toContain('activityType');
    expect(line1852).not.toContain('activityType');
  });

  it('FreeRunSummary.tsx:179 share text is a bare template literal with zero activity-type interpolation', () => {
    const filePath = path.join(
      REPO_ROOT,
      'src/features/workout-engine/players/running/components/FreeRun/FreeRunSummary.tsx',
    );
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const line179 = lines[178];
    expect(line179).toContain('ריצה חופשית');
    expect(line179).toContain('#ריצה');
    expect(line179).not.toMatch(/activityType|sessionActivityType/);
  });
});

describe('Execution proof: a completed WALKING session gets written to Firestore tagged as running', () => {
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

  it('reproduces the exact object useRunningPlayer.ts sends today for a walk, runs it through the REAL (unmocked) completion pipeline, and captures the real Firestore write', async () => {
    const { setDoc } = await import('firebase/firestore');
    // Import the REAL, unmodified production function — not a re-implementation.
    const { syncWorkoutCompletion } = await import(
      '@/features/workout-engine/services/completion-sync.service'
    );

    // This object is copied verbatim from useRunningPlayer.ts:1846-1854 —
    // exactly what today's code sends when a WALKING session finishes.
    await syncWorkoutCompletion({
      workoutType: 'running',
      durationMinutes: 22,
      calories: 140,
      activityCategory: 'cardio',
      displayIcon: 'run-fast',
      distanceKm: 1.8,
    });

    // Consequence #1 (new finding, not in the stage-1 doc): the walk's
    // distance/duration gets recorded into the RUNNING weekly-volume
    // tracker, because completion-sync.service.ts:104 branches on
    // `payload.workoutType === 'running'` — which is true here even
    // though the session was a walk.
    expect(recordRunningSession).toHaveBeenCalledWith(1.8, 22);

    // Consequence #2: what did the REAL useProgressionStore.markTodayAsCompleted
    // actually write to dailyProgress via setDoc? (db/setDoc are mocked —
    // everything else in the call chain is live production code.)
    const setDocMock = setDoc as unknown as { mock: { calls: unknown[][] } };
    const dailyProgressCall = setDocMock.mock.calls.find(
      (call) => JSON.stringify(call[1]).includes('workoutType'),
    );
    expect(dailyProgressCall).toBeDefined();
    const written = dailyProgressCall![1] as Record<string, unknown>;

    // eslint-disable-next-line no-console
    console.log(
      '[VERIFY] Real setDoc(dailyProgress, ...) payload for a WALK, as executed today:',
      JSON.stringify(written, null, 2),
    );

    expect(written.workoutType).toBe('running'); // ← the bug, captured live
    expect(written.displayIcon).toBe('run-fast'); // ← the bug, captured live
  });

  it('control: the SAME real code path correctly labels the session when given the value it SHOULD have received', async () => {
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

    // eslint-disable-next-line no-console
    console.log(
      '[VERIFY] Same real code path, correctly-tagged input:',
      JSON.stringify(written, null, 2),
    );

    expect(written.workoutType).toBe('walking');
    expect(written.displayIcon).toBe('walk'); // proves getWorkoutIcon('walking') really does map correctly — bug is isolated to the origination point, not the pipeline
  });
});
