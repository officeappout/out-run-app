import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyIntenseOption, applyFlowRegression, clearSwappedProtocolFields } from '../trio-modifiers.service';
import { substituteExercise } from '../../logic/WorkoutGenerator';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Generator audit P0 #2 (2026-10-17): the D3 "David Rule" swap built
 * `{...replaced, exercise: candidate, method: candidate.executionMethods?.[0]}`:
 *   - the replaced slot's pyramidSequence / repsSequence / pairedWith rode
 *     along onto a different movement ("שכיבות סמיכה ב-45°" shipping a
 *     dip-hold pyramid — 16/43 pyramids stale in the offline matrix),
 *   - the method was method[0] with no location/gear check,
 *   - candidates came from the raw catalog, not the session's filtered pool.
 * Same spread in the naked-filter violation path and in every
 * GuaranteePassRunner substitution (substituteExercise).
 */

const pushEx = (id: string, level: number, methods?: Array<Record<string, unknown>>): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup: 'vertical_push',
    mechanicalType: 'bent_arm',
    type: 'reps',
    targetPrograms: [{ programId: 'push', level }],
    execution_methods: methods ?? [{ location: 'home', methodName: `${id}-home`, gearIds: [] }],
    tags: [],
  } as unknown as Exercise);

const slot = (exercise: Exercise, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({
    exercise,
    method: {},
    mechanicalType: 'bent_arm',
    sets: 3,
    reps: 8,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    priority: 'compound',
    score: 50,
    reasoning: [],
    ...extra,
  } as unknown as WorkoutExercise);

const workoutOf = (exercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 't', description: 'd', exercises,
    estimatedDuration: 30, structure: 'standard', difficulty: 3,
    mechanicalBalance: {} as any, stats: {} as any, isRecovery: false, totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyIntenseOption — David Rule injection swap hygiene', () => {
  // User push L5; current main is all ≤ L5 → the David Rule injects a +1..+3 exercise.
  const levels = new Map([['push', 5]]);
  const a = pushEx('a_L5', 5);
  const b = pushEx('b_L4', 4);
  const stalePyramid = [
    { setIndex: 0, exerciseId: 'dip_hold_1', name: 'dip hold', targetReps: 8 },
    { setIndex: 1, exerciseId: 'dip_hold_2', name: 'dip hold', targetReps: 3 },
    { setIndex: 2, exerciseId: 'dip_hold_3', name: 'dip hold', targetReps: 1 },
  ];

  it('the injected exercise does not inherit the replaced slot\'s pyramid / rep sequence / pairing', () => {
    const candidate = pushEx('cand_L6', 6);
    const workout = workoutOf([
      slot(a, { pairedWith: 'b_L4' }),
      slot(b, { pyramidSequence: stalePyramid as any, repsSequence: [8, 3, 1], pairedWith: 'a_L5', supersetType: 'compound' }),
    ]);

    applyIntenseOption(workout, new Set(), levels, [a, b, candidate], 'home', {
      candidatePool: [a, b, candidate],
      availableEquipment: ['bodyweight'],
    });

    const injected = workout.exercises.find(e => e.exercise.id === 'cand_L6')!;
    expect(injected).toBeDefined();
    // Either re-stamped for the NEW exercise or cleared — never the old dip-hold steps.
    expect(injected.pyramidSequence?.some(s => s.exerciseId.startsWith('dip_hold'))).not.toBe(true);
    if (!injected.pyramidSequence) expect(injected.repsSequence).toBeUndefined();
    expect(injected.pairedWith).toBeUndefined();
    expect(injected.supersetType).toBeUndefined();
    // The partner no longer points at the swapped-out id.
    const partner = workout.exercises.find(e => e.exercise.id === 'a_L5')!;
    expect(partner.pairedWith).toBeUndefined();
  });

  it('candidates come from the filtered pool, not the raw catalog', () => {
    const onlyInCatalog = pushEx('catalog_only_L6', 6);
    const inPool = pushEx('pool_L7', 7);
    const workout = workoutOf([slot(a), slot(b)]);

    applyIntenseOption(workout, new Set(), levels, [a, b, onlyInCatalog, inPool], 'home', {
      candidatePool: [a, b, inPool],
      availableEquipment: ['bodyweight'],
    });

    const ids = workout.exercises.map(e => e.exercise.id);
    expect(ids).not.toContain('catalog_only_L6');
    expect(ids).toContain('pool_L7');
  });

  it('the method is chosen for the session context — a candidate whose only home method needs missing gear is skipped', () => {
    const ringsOnly = pushEx('rings_L6', 6, [{ location: 'home', methodName: 'rings', gearIds: ['rings'] }]);
    const okL7 = pushEx('ok_L7', 7, [
      { location: 'park', methodName: 'ok-park', gearIds: [] },
      { location: 'home', methodName: 'ok-home', gearIds: [] },
    ]);
    const workout = workoutOf([slot(a), slot(b)]);

    applyIntenseOption(workout, new Set(), levels, [a, b, ringsOnly, okL7], 'home', {
      candidatePool: [a, b, ringsOnly, okL7],
      availableEquipment: ['bodyweight'],
    });

    const ids = workout.exercises.map(e => e.exercise.id);
    expect(ids).not.toContain('rings_L6');
    const injected = workout.exercises.find(e => e.exercise.id === 'ok_L7')!;
    expect((injected.method as any).methodName).toBe('ok-home'); // not executionMethods[0] (the park one)
  });
});

describe('applyFlowRegression — swap hygiene + context method', () => {
  it('clears the victim\'s pairing/pyramid and picks the home method, not executionMethods[0]', () => {
    const victim = pushEx('victim_L8', 8);
    const replacement = pushEx('repl_L7', 7, [
      { location: 'park', methodName: 'repl-park', gearIds: [] },
      { location: 'home', methodName: 'repl-home', gearIds: [] },
    ]);
    const workout = workoutOf([slot(victim, { pairedWith: 'x', repsSequence: [8, 5, 3] })]);

    applyFlowRegression(workout, new Map([['push', 8]]), [victim, replacement], new Set(), 'home', 'push', undefined, undefined, ['bodyweight']);

    const swapped = workout.exercises.find(e => e.exercise.id === 'repl_L7')!;
    expect(swapped).toBeDefined();
    expect(swapped.pairedWith).toBeUndefined();
    expect(swapped.repsSequence).toBeUndefined();
    expect((swapped.method as any).methodName).toBe('repl-home');
  });
});

describe('substituteExercise (all GuaranteePassRunner swaps) — protocol fields are cleared by the spread', () => {
  it('{...victim, ...substituteExercise(...)} drops the victim\'s pyramid/pairing', () => {
    const victim = slot(pushEx('v', 5), {
      pyramidSequence: [{ setIndex: 0, exerciseId: 'old', name: 'old', targetReps: 8 }] as any,
      repsSequence: [8, 3, 1],
      pairedWith: 'p',
      supersetType: 'staggered',
    });
    const merged = { ...victim, ...substituteExercise(victim, pushEx('n', 5), undefined, 0, 2) };
    expect(merged.exercise.id).toBe('n');
    expect(merged.pyramidSequence).toBeUndefined();
    expect(merged.repsSequence).toBeUndefined();
    expect(merged.pairedWith).toBeUndefined();
    expect(merged.supersetType).toBeUndefined();
  });

  it('clearSwappedProtocolFields clears in place', () => {
    const we = slot(pushEx('v', 5), { repsSequence: [1, 2, 3], pairedWith: 'p' });
    clearSwappedProtocolFields(we);
    expect(we.repsSequence).toBeUndefined();
    expect(we.pairedWith).toBeUndefined();
  });
});
