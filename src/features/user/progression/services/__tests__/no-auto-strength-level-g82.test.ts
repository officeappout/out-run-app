import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// G8.2 (Sderot pilot, 15.10.2026) — "never a strength level without the questionnaire", behind
// enable_no_auto_strength_level (fail-closed). This file pins the WORKOUT-COMPLETION half (W3);
// the onboarding half (W1/W2) is pinned in onboarding-sync.service.test.ts. Same inline vi.mock
// convention as progression.service.test.ts (no shared Firestore test-utils in this repo).

const state = vi.hoisted(() => ({
  USER_DOC: null as Record<string, any> | null,
  FLAG_ON: false,
}));

const updateDocMock = vi.hoisted(() =>
  vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<undefined>>(async () => undefined));
const setDocMock = vi.hoisted(() => vi.fn(async () => undefined));
const flagReadMock = vi.hoisted(() => vi.fn(async () => state.FLAG_ON));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: flagReadMock }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: (_db: unknown, _col: string, uid: string) => ({ __uid: uid }),
  getDoc: vi.fn(async () => ({
    exists: () => state.USER_DOC !== null,
    data: () => state.USER_DOC ?? undefined,
  })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  updateDoc: updateDocMock,
  setDoc: setDocMock,
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {
    constructor(public ms: number) {}
    static now() { return new FakeTimestamp(Date.now()); }
  },
}));

import { processWorkoutCompletion } from '../progression.service';

const unassessedUser = () => ({
  core: { name: 'A' },
  progression: { globalLevel: 1, globalXP: 0, coins: 0, domains: {}, activePrograms: [] },
});
const assessedUser = () => ({
  core: { name: 'B' },
  progression: {
    globalLevel: 2, globalXP: 100, coins: 0,
    domains: { push: { currentLevel: 5, maxLevel: 25, isUnlocked: true } },
    tracks: { push: { currentLevel: 5, percent: 10 } },
    activePrograms: [{ id: 'push', templateId: 'push' }],
  },
});
const workout = (activeProgramId: string) => ({
  userId: 'u1',
  activeProgramId,
  exercises: [{
    exerciseId: 'ex1', exerciseName: 'Push-up', programLevels: {},
    setsCompleted: 3, repsPerSet: [10, 10, 8], targetReps: 10, isCompound: false,
  }],
  totalDuration: 20,
  completedAt: new Date(),
});

const levelWrites = () => updateDocMock.mock.calls
  .map(([, data]) => Object.keys(data ?? {}).filter((k) => k.startsWith('progression.')))
  .flat();

beforeEach(() => {
  state.USER_DOC = null;
  state.FLAG_ON = false;
  updateDocMock.mockClear();
  setDocMock.mockClear();
  flagReadMock.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('G8.2 W3 — flag ON: a strength workout without the questionnaire writes no level', () => {
  it('unassessed user, the callers\' full_body default → skipped, nothing written, not a failure', async () => {
    state.FLAG_ON = true;
    state.USER_DOC = unassessedUser();
    const r = await processWorkoutCompletion(workout('full_body') as any);
    expect(r).toMatchObject({ success: true, skipped: 'no_questionnaire', trackWriteSucceeded: true });
    expect(r.activeProgramGain).toMatchObject({ totalGain: 0, leveledUp: false });
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('unassessed user on a leaf program → skipped too', async () => {
    state.FLAG_ON = true;
    state.USER_DOC = unassessedUser();
    const r = await processWorkoutCompletion(workout('push') as any);
    expect(r.skipped).toBe('no_questionnaire');
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('an ASSESSED user is never skipped (the flag only affects unassessed users) — flag not even read', async () => {
    state.FLAG_ON = true;
    state.USER_DOC = assessedUser();
    const r = await processWorkoutCompletion(workout('push') as any);
    expect(r.skipped).toBeUndefined();
    // (progression_rules_from_admin is read for every assessed user — not this gate)
    expect(flagReadMock).not.toHaveBeenCalledWith('enable_no_auto_strength_level');
  });
});

describe('G8.2 W3 — flag OFF: today\'s behaviour, unchanged', () => {
  it('unassessed user on full_body → progression IS written (today: the made-up L1 this flag removes)', async () => {
    state.FLAG_ON = false;
    state.USER_DOC = unassessedUser();
    const r = await processWorkoutCompletion(workout('full_body') as any);
    expect(r.skipped).toBeUndefined();
    expect(flagReadMock).toHaveBeenCalledWith('enable_no_auto_strength_level');
    expect(levelWrites().length).toBeGreaterThan(0);
  });
});

describe('G8.2 — workout history and XP are separate writes, untouched by the skip', () => {
  const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const service = src('../progression.service.ts');
  it('processWorkoutCompletion awards no XP and saves no history itself (both live elsewhere)', () => {
    // calls or imports only — the G8.2 comment itself names both functions
    expect(service).not.toMatch(/\bawardWorkoutXP\(|\bsaveExerciseHistory\(|from '[^']*(awardWorkoutXP|exercise-history)/);
  });
  it('the active page saves exercise history regardless of the progression result', () => {
    const page = src('../../../../../app/workouts/[id]/active/page.tsx');
    const afterCall = page.slice(page.indexOf('const result = await processWorkoutCompletion({'));
    const historyAt = afterCall.indexOf('saveExerciseHistory(uid, exerciseResults)');
    const successGateAt = afterCall.indexOf('if (result.success)');
    expect(historyAt).toBeGreaterThan(-1);
    expect(historyAt).toBeLessThan(successGateAt); // not gated on success / skipped
  });
  it('the gate reads the flag fail-closed and is checked before any track initialisation', () => {
    const fn = service.slice(service.indexOf('export async function processWorkoutCompletion('));
    expect(fn.indexOf("readFeatureFlagOnce('enable_no_auto_strength_level')"))
      .toBeLessThan(fn.indexOf('ensureTracksInitialized(progression)'));
  });
});
