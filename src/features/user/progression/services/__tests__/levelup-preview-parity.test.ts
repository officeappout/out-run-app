import { describe, it, expect, vi, beforeEach } from 'vitest';

// Level-up v2 parity: the instant on-device result (loadLevelUpInputs → pure
// computeLevelUpPreview) must equal what processWorkoutCompletion STORES for
// the same inputs. A stateful in-memory Firestore applies every updateDoc, so
// "stored" is read back from the user doc after the real service ran — leaf,
// master (the recalculated plain average, not avg + Σ gains), level-up carry.

const state = vi.hoisted(() => ({
  USER_DOC: null as Record<string, any> | null,
  GOALS: [] as any[],
}));

function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    cur[p] = cur[p] && typeof cur[p] === 'object' ? cur[p] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

const { FULL_BODY, CHILDREN, ALL_PROGRAMS } = vi.hoisted(() => {
  const CHILDREN: Record<string, any> = {
    J0fLpmJhG0KDN2tQouxh: { id: 'J0fLpmJhG0KDN2tQouxh', name: 'דחיפה', slug: 'push', movementPattern: 'push', isMaster: false },
    UPDBtTdCvX748dtBlWYj: { id: 'UPDBtTdCvX748dtBlWYj', name: 'משיכה', slug: 'pull', movementPattern: 'pull', isMaster: false },
    OrAmOH3F375dVio5yGdU: { id: 'OrAmOH3F375dVio5yGdU', name: 'רגליים', slug: 'legs', movementPattern: 'legs', isMaster: false },
    kDMpobbKsuVTByTIKUpe: { id: 'kDMpobbKsuVTByTIKUpe', name: 'ליבה', slug: 'core', movementPattern: 'core', isMaster: false },
  };
  const FULL_BODY = {
    id: 'H2279XsRGDg9G370J7S9', name: 'כל הגוף', isMaster: true, maxLevels: 15, slug: 'full_body',
    subPrograms: Object.keys(CHILDREN),
  };
  return { FULL_BODY, CHILDREN, ALL_PROGRAMS: [FULL_BODY, ...Object.values(CHILDREN)] };
});

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: vi.fn(async () => false) }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, col: string) => ({ col }),
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: vi.fn(async (ref: { col: string }) => {
    const user = ref.col === 'users' ? state.USER_DOC : null;
    return { exists: () => user !== null, data: () => (user ? JSON.parse(JSON.stringify(user)) : undefined), id: 'x' };
  }),
  getDocs: vi.fn(async (q: { col?: string }) => {
    const docs = q?.col === 'programs' ? ALL_PROGRAMS.map((p) => ({ id: p.id, data: () => p })) : [];
    return { docs, empty: docs.length === 0, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
  }),
  query: (colRef: { col: string }) => ({ col: colRef?.col }),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  updateDoc: vi.fn(async (ref: { col: string }, data: Record<string, unknown>) => {
    if (ref.col !== 'users' || !state.USER_DOC) return;
    for (const [k, v] of Object.entries(data)) {
      if (k === 'updatedAt') continue;
      setPath(state.USER_DOC, k, JSON.parse(JSON.stringify(v)));
    }
  }),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {
    constructor(public ms: number) {}
    static now() { return new FakeTimestamp(Date.now()); }
  },
}));

vi.mock('@/features/content/programs', () => ({
  getProgram: vi.fn(async (id: string) => (id === FULL_BODY.id ? FULL_BODY : CHILDREN[id] ?? null)),
  getAllPrograms: vi.fn(async () => ALL_PROGRAMS),
  getProgramByTemplateId: vi.fn(async (slug: string) =>
    ALL_PROGRAMS.find((p: any) => p.slug === slug || p.id === slug) ?? null),
  MASTER_PROGRAM_SLUG_TO_ID: { full_body: FULL_BODY.id },
  MASTER_PROGRAM_ID_TO_SLUG: { [FULL_BODY.id]: 'full_body' },
}));

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSetting: vi.fn(async () => ({ targetGoals: state.GOALS })),
}));

vi.mock('@/features/content/exercises/core/exercise.service', () => ({
  getExercise: vi.fn(async () => null),
  getAllExercisesCached: vi.fn(async () => []),
}));

import { processWorkoutCompletion } from '../progression.service';
import { loadLevelUpInputs } from '../levelup-inputs.service';
import { computeLevelUpPreview, outcomeFromStored } from '../levelup-preview';
import type { WorkoutExerciseResult } from '../../../core/types/progression.types';

const ex = (id: string, name: string, reps: number[], target: number): WorkoutExerciseResult => ({
  exerciseId: id, exerciseName: name, programLevels: {}, setsCompleted: reps.length, repsPerSet: reps, targetReps: target, isCompound: false,
});

async function run(programId: string, exercises: WorkoutExerciseResult[]) {
  const inputs = await loadLevelUpInputs('u1', programId, exercises.map((e) => e.exerciseId));
  expect(inputs).not.toBeNull();
  const preview = computeLevelUpPreview(inputs!, exercises)!;
  const result = await processWorkoutCompletion({
    userId: 'u1', activeProgramId: programId, exercises, totalDuration: 30, completedAt: new Date(),
  });
  return { inputs: inputs!, preview, result, tracks: state.USER_DOC!.progression.tracks };
}

beforeEach(() => {
  state.GOALS = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('leaf — preview = stored', () => {
  it('base + performance + goal: same total, same stored percent', async () => {
    state.USER_DOC = { core: {}, progression: { tracks: { push: { currentLevel: 5, percent: 10, totalWorkoutsCompleted: 3 } }, domains: {}, activePrograms: [] } };
    state.GOALS = [{ exerciseId: 'pu', exerciseName: 'Push-up', targetValue: 12, unit: 'reps', progressBonus: 4 }];
    const { preview, result, tracks } = await run('push', [ex('pu', 'Push-up', [12, 11, 10], 10)]);

    expect(result.success).toBe(true);
    expect(preview.kind).toBe('leaf');
    expect(preview.totalGain).toBeCloseTo(result.activeProgramGain.totalGain, 9);
    expect(preview.after.level).toBe(tracks.push.currentLevel);
    expect(preview.after.percent).toBeCloseTo(tracks.push.percent, 9);
    expect(preview.chips.map((c) => c.id)).toEqual(['completion', 'performance', 'goals']);
    expect(preview.chips.find((c) => c.id === 'goals')!.gain).toBe(4);
    expect(preview.isFirstWorkout).toBe(false);
  });

  it('level-up: carries the excess into the NEW level, exactly as stored', async () => {
    state.USER_DOC = { core: {}, progression: { tracks: { push: { currentLevel: 3, percent: 96, totalWorkoutsCompleted: 9 } }, domains: {}, activePrograms: [] } };
    const { preview, tracks, result } = await run('push', [ex('pu', 'Push-up', [10, 10, 10, 10], 10)]);
    expect(preview.leveledUp).toBe(true);
    expect(result.activeProgramGain.leveledUp).toBe(true);
    expect(preview.after).toEqual({ level: 4, percent: expect.any(Number) });
    expect(tracks.push.currentLevel).toBe(4);
    expect(preview.after.percent).toBeCloseTo(tracks.push.percent, 9); // 96 + 10 − 100 = 6
    expect(preview.after.percent).toBeCloseTo(6, 9);
  });

  it('skill mastery is a chip and part of the stored number', async () => {
    state.USER_DOC = { core: {}, progression: { tracks: { planche: { currentLevel: 2, percent: 20, totalWorkoutsCompleted: 1 } }, domains: {}, activePrograms: [] } };
    const { preview, tracks } = await run('planche', [ex('pl', 'Planche lean', [6, 5], 5)]);
    expect(preview.chips.some((c) => c.id === 'mastery' && c.gain === 17.5)).toBe(true);
    expect(preview.after.percent).toBeCloseTo(tracks.planche.percent, 9);
  });

  it('zero sets: no chips, nothing moves — and the stored track agrees', async () => {
    state.USER_DOC = { core: {}, progression: { tracks: { push: { currentLevel: 5, percent: 40, totalWorkoutsCompleted: 3 } }, domains: {}, activePrograms: [] } };
    const { preview, tracks } = await run('push', [ex('pu', 'Push-up', [], 10)]);
    expect(preview.chips).toEqual([]);
    expect(preview.after).toEqual({ level: 5, percent: 40 });
    expect(tracks.push.percent).toBe(40);
  });

  it('reconcile from the stored result gives the same outcome as the preview', async () => {
    state.USER_DOC = { core: {}, progression: { tracks: { push: { currentLevel: 5, percent: 10, totalWorkoutsCompleted: 3 } }, domains: {}, activePrograms: [] } };
    const { inputs, preview, result } = await run('push', [ex('pu', 'Push-up', [12, 11, 10], 10)]);
    const stored = outcomeFromStored(inputs, result, { level: 5, percent: 10 })!;
    expect(stored.after.level).toBe(preview.after.level);
    expect(stored.after.percent).toBeCloseTo(preview.after.percent, 9);
    expect(stored.chips.map((c) => c.id)).toEqual(preview.chips.map((c) => c.id));
  });
});

describe('master (full_body) — preview = the stored average', () => {
  function masterUser() {
    return {
      core: {},
      progression: {
        tracks: {
          push: { currentLevel: 5, percent: 40, totalWorkoutsCompleted: 2 },
          pull: { currentLevel: 4, percent: 50, totalWorkoutsCompleted: 2 },
          legs: { currentLevel: 6, percent: 10, totalWorkoutsCompleted: 2 },
          core: { currentLevel: 3, percent: 0, totalWorkoutsCompleted: 2 },
          full_body: { currentLevel: 5, percent: 33.33, totalWorkoutsCompleted: 2 },
        },
        domains: {},
        activePrograms: [],
      },
    };
  }

  it('the stored master = plain average of push/pull/legs after the session (core excluded)', async () => {
    state.USER_DOC = masterUser();
    const { preview, tracks, result } = await run('full_body', [
      ex('a', 'Push-up', [10, 10, 10], 10),
      ex('b', 'Pull-up', [8, 8], 6),
      ex('c', 'Plank', [30, 30], 30),
    ]);
    expect(result.childDomainGains?.length).toBeGreaterThan(0);
    // Sanity: the stored master really is the recalculated average (push/pull/legs).
    const avg = (tracks.push.percent + tracks.pull.percent + tracks.legs.percent) / 3;
    expect(tracks.full_body.percent).toBeCloseTo(Math.round(avg * 100) / 100, 9);
    expect(preview.kind).toBe('master');
    expect(preview.after.level).toBe(tracks.full_body.currentLevel);
    expect(preview.after.percent).toBeCloseTo(tracks.full_body.percent, 6);
    // …and that is NOT "old average + Σ child gains" (the old screen's number).
    const sumGains = result.childDomainGains!.reduce((s, c) => s + c.totalGain, 0);
    expect(preview.after.percent).not.toBeCloseTo(33.33 + sumGains, 1);
    // Domain chips carry each child's own gain.
    expect(preview.chips.map((c) => c.id)).toEqual(['domain:push', 'domain:pull', 'domain:core']);
  });

  it('a child that levels up wraps its percent — the average follows the stored value', async () => {
    const u = masterUser();
    u.progression.tracks.pull = { currentLevel: 4, percent: 97, totalWorkoutsCompleted: 2 };
    state.USER_DOC = u;
    const { preview, tracks } = await run('full_body', [ex('b', 'Pull-up', [8, 8, 8, 8], 6)]);
    expect(tracks.pull.currentLevel).toBe(5);
    expect(preview.after.level).toBe(tracks.full_body.currentLevel);
    expect(preview.after.percent).toBeCloseTo(tracks.full_body.percent, 6);
  });

  it('reconcile with the read-back master track keeps the stored number', async () => {
    state.USER_DOC = masterUser();
    const { inputs, result, tracks } = await run('full_body', [ex('a', 'Push-up', [10, 10, 10], 10)]);
    const stored = outcomeFromStored(inputs, result, { level: 5, percent: 33 }, {
      level: tracks.full_body.currentLevel, percent: tracks.full_body.percent,
    })!;
    expect(stored.after.percent).toBeCloseTo(tracks.full_body.percent, 9);
    expect(stored.before).toEqual({ level: 5, percent: 33.33 });
  });
});
