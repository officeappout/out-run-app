import { describe, it, expect } from 'vitest';
import {
  planWarmupGuideBuckets,
  resolveWorkoutBodyFocus,
  warmupGuideFocus,
} from '../warmup-guide-focus.utils';
import { prependWarmupExercises } from '../warmup.service';
import { applyDomainPrioritySort } from '../../logic/workout-sorting.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

const ex = (o: Record<string, unknown>) => o as any;

describe('resolveWorkoutBodyFocus', () => {
  it('push/pull only → upper', () => {
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'vertical_push' }), ex({ movementGroup: 'horizontal_pull' })])).toBe('upper');
  });
  it('squat/hinge/lunge only → lower', () => {
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'squat' }), ex({ movementGroup: 'lunge' })])).toBe('lower');
  });
  it('upper + lower → full', () => {
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'vertical_pull' }), ex({ movementGroup: 'hinge' })])).toBe('full');
  });
  it('falls back to muscles when the movementGroup says nothing', () => {
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'core', muscleGroups: ['glutes'] })])).toBe('lower');
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'isolation', primaryMuscle: 'biceps' })])).toBe('upper');
  });
  it('pure core / nothing → null', () => {
    expect(resolveWorkoutBodyFocus([ex({ movementGroup: 'core', muscleGroups: ['abs'] })])).toBeNull();
    expect(resolveWorkoutBodyFocus([])).toBeNull();
  });
});

describe('warmupGuideFocus', () => {
  it('tag wins', () => {
    expect(warmupGuideFocus(ex({ tags: ['warmup_lower'], muscleGroups: ['chest'] }))).toBe('lower');
    expect(warmupGuideFocus(ex({ tags: ['warmup_upper'] }))).toBe('upper');
  });
  it('untagged: lower-only muscles → lower, otherwise upper/general', () => {
    expect(warmupGuideFocus(ex({ muscleGroups: ['quads', 'calves'] }))).toBe('lower');
    expect(warmupGuideFocus(ex({ muscleGroups: ['chest', 'back', 'abs'] }))).toBe('upper');
    expect(warmupGuideFocus(ex({}))).toBe('upper');
  });
});

describe('planWarmupGuideBuckets', () => {
  const up = ex({ id: 'up', tags: ['warmup_upper'] });
  const legacyUp = ex({ id: 'legacy', muscleGroups: ['chest'] });
  const low = ex({ id: 'low', tags: ['warmup_lower'] });
  const ids = (b: any[][]) => b.map((x) => x.map((g) => g.id));

  it('upper → upper guides only', () => expect(ids(planWarmupGuideBuckets([up, legacyUp, low], 'upper'))).toEqual([['up', 'legacy']]));
  it('lower → lower guide only', () => expect(ids(planWarmupGuideBuckets([up, low], 'lower'))).toEqual([['low']]));
  it('full → upper bucket then lower bucket', () => expect(ids(planWarmupGuideBuckets([low, up], 'full'))).toEqual([['up'], ['low']]));
  it('full with one side missing → just the side that exists', () => expect(ids(planWarmupGuideBuckets([up], 'full'))).toEqual([['up']]));
  it('wanted side missing → all guides (one pick, as before)', () => expect(ids(planWarmupGuideBuckets([up], 'lower'))).toEqual([['up']]));
  it('no focus → one bucket of all guides', () => expect(ids(planWarmupGuideBuckets([up, low], null))).toEqual([['up', 'low']]));
  it('no guides → nothing', () => expect(planWarmupGuideBuckets([], 'full')).toEqual([]));
});

// ── Integration: prependWarmupExercises picks guides by focus ───────────────
const homeMethods = () => [{ location: 'home', requiredGearType: 'none' }] as any;
const guide = (id: string, tag: string): Exercise =>
  ({ id, name: { he: id, en: id }, isFollowAlong: true, exerciseRole: 'warmup', tags: [tag], movementGroup: 'flexibility', execution_methods: homeMethods() }) as any;
const main = (id: string, movementGroup: string): WorkoutExercise =>
  ({
    exercise: { id, name: { he: id, en: id }, movementGroup, execution_methods: homeMethods() },
    method: homeMethods()[0], mechanicalType: 'none', sets: 3, reps: 10, isTimeBased: false,
    restSeconds: 60, priority: 'compound', score: 10, reasoning: [], exerciseRole: 'main',
  }) as any;
const workoutOf = (...mains: WorkoutExercise[]): GeneratedWorkout =>
  ({ title: { he: '', en: '' }, description: { he: '', en: '' }, exercises: mains, estimatedDuration: 20, structure: 'full', difficulty: 2 }) as any;

function warmupIdsFor(mains: WorkoutExercise[], timeMin = 45): string[] {
  const workout = workoutOf(...mains);
  const catalog = [guide('g-upper', 'warmup_upper'), guide('g-lower', 'warmup_lower')];
  // empty levels → maxUserLevel 1 → no ladder, only Stage 1 guides
  prependWarmupExercises(workout, catalog, new Map(), 'home' as any, [], undefined, 2 as any, [], timeMin);
  return applyDomainPrioritySort(workout.exercises)
    .filter((we) => we.exerciseRole === 'warmup')
    .map((we) => we.exercise.id);
}

describe('prependWarmupExercises — joint-rotation guide by workout focus', () => {
  it('upper-body workout → the upper guide only', () => {
    expect(warmupIdsFor([main('m1', 'vertical_push'), main('m2', 'horizontal_pull')])).toEqual(['g-upper']);
  });
  it('lower-body workout → the lower guide only', () => {
    expect(warmupIdsFor([main('m1', 'squat'), main('m2', 'hinge')])).toEqual(['g-lower']);
  });
  it('full-body workout → both, upper first', () => {
    expect(warmupIdsFor([main('m1', 'squat'), main('m2', 'vertical_pull')])).toEqual(['g-upper', 'g-lower']);
  });
  it('≤30 min (lean frame, owner 30.10.2026): full body gets one guide only', () => {
    expect(warmupIdsFor([main('m1', 'squat'), main('m2', 'vertical_pull')], 30)).toEqual(['g-upper']);
  });
  it('full-body keeps all main exercises', () => {
    const workout = workoutOf(main('m1', 'squat'), main('m2', 'vertical_pull'));
    prependWarmupExercises(workout, [guide('g-upper', 'warmup_upper'), guide('g-lower', 'warmup_lower')], new Map(), 'home' as any, [], undefined, 2 as any, [], 10);
    expect(workout.exercises.filter((we) => we.exerciseRole === 'main')).toHaveLength(2);
  });
  it('no body focus (pure core) → exactly one guide, as before', () => {
    expect(warmupIdsFor([main('m1', 'core')])).toHaveLength(1);
  });
});
