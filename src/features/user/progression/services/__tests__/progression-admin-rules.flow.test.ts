import { describe, it, expect, vi, beforeEach } from 'vitest';

// End-to-end through processWorkoutCompletion (leaf flow) with Firestore stubbed:
// admin rules ON vs OFF on the same user + workout. Same inline vi.mock convention
// as no-auto-strength-level-g82.test.ts.

const state = vi.hoisted(() => ({
  DOCS: {} as Record<string, Record<string, any>>,
  QUERY_DOCS: {} as Record<string, Record<string, any>[]>,
  ADMIN_FLAG: false,
}));
const updateDocMock = vi.hoisted(() =>
  vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<undefined>>(async () => undefined));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/feature-flag-once', () => ({
  readFeatureFlagOnce: vi.fn(async (k: string) => (k === 'progression_rules_from_admin' ? state.ADMIN_FLAG : false)),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, col: string) => ({ col }),
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: vi.fn(async (ref: { col: string; id: string }) => {
    const data = state.DOCS[`${ref.col}/${ref.id}`];
    return { id: ref.id, exists: () => data !== undefined, data: () => data };
  }),
  getDocs: vi.fn(async (q: { col?: string } | undefined) => {
    const docs = (q?.col && state.QUERY_DOCS[q.col]) || [];
    return { empty: docs.length === 0, docs: docs.map((d, i) => ({ id: d.__id ?? String(i), data: () => d })) };
  }),
  query: (c: { col: string }) => c,
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  updateDoc: updateDocMock,
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class FakeTimestamp {
    constructor(public ms: number) {}
    static now() { return new FakeTimestamp(Date.now()); }
  },
}));

import { processWorkoutCompletion, __resetProgressionRuleCacheForTests } from '../progression.service';
import { __clearPlsCacheForTests } from '@/features/content/programs/core/programLevelSettings.service';

const GOAL = { exerciseId: 'ex1', exerciseName: 'Push-up', targetValue: 10, unit: 'reps', progressBonus: 5 };

function seed(track: Record<string, unknown>) {
  state.DOCS = {
    'users/u1': {
      core: { name: 'B' },
      progression: {
        globalLevel: 2, globalXP: 100, coins: 0,
        domains: { push: { currentLevel: 3, maxLevel: 25, isUnlocked: true } },
        tracks: { push: { currentLevel: 3, percent: 10, ...track } },
        activePrograms: [{ id: 'push', templateId: 'push' }],
      },
    },
    // slug-keyed so the OFF path (single raw lookup) finds the same rule — isolates the bonuses
    'progression_rules/push_level_3': { baseSessionGain: 10, bonusPercent: 5, requiredSetsForFullGain: 6 },
    'programLevelSettings/push_level_3': {
      targetGoals: [GOAL], firstSessionBonus: 3, maxSets: 20,
      persistenceBonusConfig: { '2': 1 }, rpeBonusConfig: { '7': 1 },
    },
  };
  state.QUERY_DOCS = {};
}

const workout = (extra: Record<string, unknown> = {}) => ({
  userId: 'u1',
  activeProgramId: 'push',
  exercises: [{
    exerciseId: 'ex1', exerciseName: 'Push-up', programLevels: {},
    setsCompleted: 6, repsPerSet: [10, 10, 10, 10, 10, 10], targetReps: 10, isCompound: false,
  }],
  totalDuration: 20,
  completedAt: new Date(2026, 9, 22),
  ...extra,
});

const writtenTrack = () => {
  const call = updateDocMock.mock.calls.find(([, d]) => d && 'progression.tracks' in d);
  return (call?.[1]['progression.tracks'] as Record<string, any>)?.push;
};

beforeEach(() => {
  state.ADMIN_FLAG = false;
  updateDocMock.mockClear();
  __resetProgressionRuleCacheForTests();
  __clearPlsCacheForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('flag OFF — today\'s numbers exactly', () => {
  it('base 10% + goal re-paid (+5%) even though it was completed before; no extras; no new counters', async () => {
    seed({ totalWorkoutsCompleted: 4, completedGoalIds: ['ex1'] });
    const r = await processWorkoutCompletion(workout({ sessionRpe: 7 }) as any);
    expect(r.activeProgramGain).toMatchObject({ baseGain: 10, bonusGain: 0, goalBonusGain: 5, totalGain: 15, newPercent: 25 });
    expect(r.activeProgramGain.adminBonuses).toBeUndefined();
    const t = writtenTrack();
    expect(t.levelSessions).toBeUndefined();
    expect(t.monthKey).toBeUndefined();
  });
});

describe('flag ON (panel switch)', () => {
  it('goal already completed at this level pays nothing; RPE + persistence (#4 ≥ last key) paid; counters written', async () => {
    state.ADMIN_FLAG = true;
    seed({ totalWorkoutsCompleted: 4, completedGoalIds: ['ex1'], levelSessions: 2, monthKey: '2026-10', monthSessions: 3 });
    const r = await processWorkoutCompletion(workout({ sessionRpe: 7 }) as any);
    expect(r.activeProgramGain).toMatchObject({ baseGain: 10, goalBonusGain: 0, totalGain: 12 });
    expect(r.activeProgramGain.adminBonuses).toMatchObject({
      firstSessionBonus: 0, persistenceBonus: 1, rpeBonus: 1, ruleSource: 'progression_rules', countedSets: 6,
    });
    expect(writtenTrack()).toMatchObject({ levelSessions: 3, monthKey: '2026-10', monthSessions: 4 });
  });

  it('first session at the level + 2nd session this month + goal met for the first time', async () => {
    state.ADMIN_FLAG = true;
    seed({ totalWorkoutsCompleted: 4, completedGoalIds: [], levelSessions: 0, monthKey: '2026-10', monthSessions: 1 });
    const r = await processWorkoutCompletion(workout() as any);
    // base 10 + goal 5 + first session 3 + persistence (#2) 1
    expect(r.activeProgramGain).toMatchObject({ goalBonusGain: 5, totalGain: 19 });
    expect(r.activeProgramGain.newlyCompletedGoalIds).toEqual(['ex1']);
    expect(writtenTrack().completedGoalIds).toEqual(['ex1']);
  });

  it('super admin previews it with the panel switch off', async () => {
    state.ADMIN_FLAG = false;
    seed({ totalWorkoutsCompleted: 4, completedGoalIds: ['ex1'], levelSessions: 2 });
    (state.DOCS['users/u1'] as any).core.isSuperAdmin = true;
    const r = await processWorkoutCompletion(workout() as any);
    expect(r.activeProgramGain.goalBonusGain).toBe(0);
    expect(r.activeProgramGain.adminBonuses).toBeDefined();
  });

  it('level above the last configured one carries it (via the program query)', async () => {
    state.ADMIN_FLAG = true;
    seed({ totalWorkoutsCompleted: 4, levelSessions: 2 });
    delete state.DOCS['progression_rules/push_level_3'];
    delete state.DOCS['programLevelSettings/push_level_3'];
    state.QUERY_DOCS = {
      progression_rules: [{ programId: 'push', level: 2, baseSessionGain: 4, bonusPercent: 0, requiredSetsForFullGain: 6 }],
      programLevelSettings: [{ programId: 'push', levelNumber: 2, maxSets: 3 }],
    };
    const r = await processWorkoutCompletion(workout() as any);
    // L2 rule carried to L3: 4% base × (3 capped sets / 6)
    expect(r.activeProgramGain.baseGain).toBeCloseTo(2);
    expect(r.activeProgramGain.adminBonuses?.countedSets).toBe(3);
  });

  it('goals saved under the program DOC ID (admin) pay for a slug track key; OFF misses them', async () => {
    // the generator converts slug → doc id (home-workout.service.ts); the admin saves goals by doc id
    const DOC_ID = 'J0fLpmJhG0KDN2tQouxh';
    const run = async (on: boolean) => {
      state.ADMIN_FLAG = on;
      __resetProgressionRuleCacheForTests();
      __clearPlsCacheForTests();
      seed({ totalWorkoutsCompleted: 4, completedGoalIds: [], levelSessions: 2 });
      state.DOCS[`programLevelSettings/${DOC_ID}_level_3`] = state.DOCS['programLevelSettings/push_level_3'];
      delete state.DOCS['programLevelSettings/push_level_3'];
      state.QUERY_DOCS = { programs: [{ __id: DOC_ID, name: 'דחיפה', slug: 'push', movementPattern: 'push' }] };
      return processWorkoutCompletion(workout() as any);
    };
    const on = await run(true);
    expect(on.activeProgramGain.goalBonusGain).toBe(5);
    expect(on.activeProgramGain.newlyCompletedGoalIds).toEqual(['ex1']);
    expect(on.goalProgress.map((g) => g.exerciseId)).toEqual(['ex1']);
    const off = await run(false);
    expect(off.activeProgramGain.goalBonusGain).toBe(0);
  });
});
