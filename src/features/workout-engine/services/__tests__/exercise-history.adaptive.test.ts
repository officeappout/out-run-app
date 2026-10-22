import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  PREV: {} as Record<string, Record<string, unknown> | undefined>,
  written: [] as { id: string; data: Record<string, unknown> }[],
  getDocCalls: 0,
  homeV2: false,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/features/workout-engine/players/running/lib/home-v2-gate', () => ({ homeV2EnabledNow: () => state.homeV2 }));
vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({ __col: true }),
  doc: (_db: unknown, ...path: string[]) => ({ id: path[path.length - 1] }),
  getDoc: async (ref: { id: string }) => {
    state.getDocCalls++;
    const d = state.PREV[ref.id];
    return { exists: () => !!d, data: () => d };
  },
  getDocs: vi.fn(),
  setDoc: async (ref: { id: string }, data: Record<string, unknown>) => { state.written.push({ id: ref.id, data }); },
  addDoc: async () => ({}),
  query: vi.fn(), where: vi.fn(), documentId: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  serverTimestamp: () => 'TS',
}));

import { saveExerciseHistory, type AdaptiveSessionMeta } from '../exercise-history.service';

const result = (id: string, reps: number[], targetReps: number) =>
  ({ exerciseId: id, exerciseName: id, programLevels: {}, setsCompleted: reps.length, repsPerSet: reps, targetReps, isCompound: false });
const meta = (p: Partial<AdaptiveSessionMeta> = {}): AdaptiveSessionMeta =>
  ({ target: 5, range: { min: 4, max: 6 }, isHold: false, ...p });

beforeEach(() => {
  state.PREV = {}; state.written = []; state.getDocCalls = 0; state.homeV2 = false;
  vi.stubGlobal('navigator', { onLine: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('saveExerciseHistory — 3a adaptive state', () => {
  it('flag off (no meta): no reads, the exact original doc', async () => {
    await saveExerciseHistory('u', [result('a', [5, 5], 5)]);
    expect(state.getDocCalls).toBe(0);
    expect(state.written[0].data).toEqual({ exerciseId: 'a', exerciseName: 'a', reps: [5, 5], targetReps: 5, updatedAt: 'TS' });
  });

  it('flag on: one read per exercise, next state written on the same doc', async () => {
    await saveExerciseHistory('u', [result('a', [5, 5, 5], 5)], new Map([['a', meta()]]));
    expect(state.getDocCalls).toBe(1);
    const adaptive = state.written[0].data.adaptive as { nextTarget: number; v: number };
    expect(adaptive.v).toBe(1);
    expect(adaptive.nextTarget).toBe(6);
  });

  it('a skipped session re-writes the previous state (the overwrite would drop it)', async () => {
    const prev = { v: 1, nextTarget: 6, topStreak: 1, missStreak: 0, extraSets: 0, variationStep: 0, isHold: false, range: { min: 4, max: 6 }, updatedAtMs: Date.now() };
    state.PREV.a = { reps: [6], adaptive: prev };
    await saveExerciseHistory('u', [result('a', [2, 2], 6)], new Map([['a', meta({ target: 6, skip: true })]]));
    expect(state.written[0].data.adaptive).toEqual(prev);
  });

  it('home v2 aggregates and adaptive share the single read', async () => {
    state.homeV2 = true;
    await saveExerciseHistory('u', [result('a', [5, 5, 5], 5)], new Map([['a', meta()]]));
    expect(state.getDocCalls).toBe(1);
    expect(state.written[0].data).toHaveProperty('bestReps');
    expect(state.written[0].data).toHaveProperty('adaptive');
  });
});
