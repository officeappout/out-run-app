import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildWorkoutPlanFromGenerated,
  resolveStartHandOff,
} from '../workout-plan.mapper';
import { TABATA_CLASSIC } from '../../logic/protocols/tabata.constants';
import type { GeneratedWorkout } from '../../logic/workout-generator.types';

/**
 * Custom-builder 15→45 bug (13.07.2026): the drawer held the generated
 * workout only as a React prop — nothing serialized it, so "התחל אימון"
 * re-stamped HOME's stale dashboard plan. These tests lock the hand-off
 * precedence and the shared mapper's segment assembly.
 */

const gwExercise = (id: string, over: Record<string, unknown> = {}) =>
  ({
    exercise: {
      id,
      name: { he: id },
      type: 'reps',
      exerciseRole: 'main',
      primaryMuscle: 'chest',
      execution_methods: [],
    },
    method: {},
    sets: 3,
    reps: 8,
    restSeconds: 90,
    isTimeBased: false,
    score: 50,
    reasoning: [],
    priority: 'compound',
    mechanicalType: 'bent_arm',
    ...over,
  } as never);

const gwOf = (exercises: unknown[], over: Record<string, unknown> = {}): GeneratedWorkout =>
  ({
    title: 'אימון בדיקה',
    description: '',
    exercises,
    estimatedDuration: 15,
    structure: 'standard',
    difficulty: 2,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: false,
    totalPlannedSets: 6,
    ...over,
  } as never);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('buildWorkoutPlanFromGenerated (shared mapper)', () => {
  it('builds role segments and stamps id/duration/difficulty from gw', () => {
    const plan = buildWorkoutPlanFromGenerated(
      gwOf([
        gwExercise('w1', { exercise: { id: 'w1', name: { he: 'w1' }, exerciseRole: 'warmup', execution_methods: [] } }),
        gwExercise('a'),
        gwExercise('c1', { exercise: { id: 'c1', name: { he: 'c1' }, exerciseRole: 'cooldown', execution_methods: [] } }),
      ]),
      'builder-123',
    );
    expect(plan.id).toBe('builder-123');
    expect(plan.totalDuration).toBe(15);
    expect(plan.difficulty).toBe('medium');
    expect((plan.segments as Array<{ id: string }>).map((s) => s.id))
      .toEqual(['seg-warmup', 'seg-main', 'seg-cooldown']);
  });

  it('TABATA: gw.tabataBlock → seg-tabata with protocolConfig, members out of seg-main', () => {
    const plan = buildWorkoutPlanFromGenerated(
      gwOf(
        [gwExercise('a'), gwExercise('t1'), gwExercise('t2')],
        { tabataBlock: { config: TABATA_CLASSIC, exerciseIds: ['t1', 't2'] } },
      ),
      'builder-tabata',
    );
    const segs = plan.segments as Array<{ id: string; protocol?: string; protocolConfig?: unknown; exercises: Array<{ id: string }> }>;
    expect(segs.map((s) => s.id)).toEqual(['seg-main', 'seg-tabata']);
    const tabata = segs.find((s) => s.id === 'seg-tabata')!;
    expect(tabata.protocol).toBe('tabata');
    expect(tabata.protocolConfig).toEqual(TABATA_CLASSIC);
    expect(tabata.exercises.map((e) => e.id)).toEqual(['t1', 't2']);
    expect(segs.find((s) => s.id === 'seg-main')!.exercises.map((e) => e.id)).toEqual(['a']);
  });

  it('no tabataBlock → no seg-tabata (field-guard)', () => {
    const plan = buildWorkoutPlanFromGenerated(gwOf([gwExercise('a'), gwExercise('b')]), 'x');
    expect((plan.segments as Array<{ id: string }>).some((s) => s.id === 'seg-tabata')).toBe(false);
  });
});

describe('resolveStartHandOff (pure hand-off precedence)', () => {
  const staleStored = JSON.stringify({
    id: 'stale-home-plan',
    segments: [{ id: 'seg-main', exercises: [{ id: 'stale' }] }],
    totalDuration: 45,
  });

  it('THE BUG: generatedWorkout WINS over a stale stored plan', () => {
    const gw = gwOf([gwExercise('fresh-a'), gwExercise('fresh-b')]);
    const r = resolveStartHandOff({
      generatedWorkout: gw,
      storedActivePlanJson: staleStored, // home's 45-min dashboard leftover
      legacyPlan: null,
      workoutId: 'workout-builder-1',
      isWarmupActive: true,
    });
    expect(r.source).toBe('generated');
    expect(r.plan!.id).toBe('workout-builder-1');
    expect(r.plan!.totalDuration).toBe(15); // the builder's plan, not the stale 45
    expect(r.plan!.isWarmupActive).toBe(true);
    const mains = (r.plan!.segments as Array<{ id: string; exercises: Array<{ id: string }> }>)
      .find((s) => s.id === 'seg-main')!.exercises.map((e) => e.id);
    expect(mains).toEqual(['fresh-a', 'fresh-b']);
  });

  it('no generated → valid stored plan is re-stamped (home flow fallback)', () => {
    const r = resolveStartHandOff({
      generatedWorkout: null,
      storedActivePlanJson: staleStored,
      legacyPlan: null,
      workoutId: 'workout-2026-07-13',
      isWarmupActive: false,
    });
    expect(r.source).toBe('stored');
    expect(r.plan!.id).toBe('workout-2026-07-13');
    expect(r.plan!.isWarmupActive).toBe(false);
    expect(r.plan!.totalDuration).toBe(45);
  });

  it('corrupt/empty stored → legacy skeleton (favorites flow only)', () => {
    const legacy = { id: 'x', segments: [{ id: 'strength-segment' }] };
    expect(resolveStartHandOff({
      generatedWorkout: null,
      storedActivePlanJson: '{not json',
      legacyPlan: legacy,
      workoutId: 'fav-1',
      isWarmupActive: true,
    }).source).toBe('legacy');
    expect(resolveStartHandOff({
      generatedWorkout: null,
      storedActivePlanJson: JSON.stringify({ segments: [] }), // degenerate
      legacyPlan: legacy,
      workoutId: 'fav-1',
      isWarmupActive: true,
    }).source).toBe('legacy');
  });

  it('nothing available → none (runner falls to Firestore lookup)', () => {
    const r = resolveStartHandOff({
      generatedWorkout: undefined,
      storedActivePlanJson: null,
      legacyPlan: null,
      workoutId: 'w',
      isWarmupActive: true,
    });
    expect(r).toEqual({ source: 'none', plan: null });
  });

  it('empty generated workout does not shadow the stored plan', () => {
    const r = resolveStartHandOff({
      generatedWorkout: gwOf([]),
      storedActivePlanJson: staleStored,
      legacyPlan: null,
      workoutId: 'w',
      isWarmupActive: true,
    });
    expect(r.source).toBe('stored');
  });
});
