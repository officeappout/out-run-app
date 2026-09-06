import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEssentialGearFilter, applyFlowRegression } from '../trio-modifiers.service';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * A 4th site of the same bug class Fix 1 (GuaranteePassRunner.ts, 05.09.2026)
 * fixed in the 3 guarantee passes: a domain-blind mechanism that can drop the
 * sole remaining representative of a PRIMARY_DOMAINS domain (push/pull/legs/
 * core). Found live-tracing a real workout where `applyFlowRegression`'s call
 * into `applyEssentialGearFilter` was the exact point pull went from present
 * to zero — the naked/gear filter had no domain awareness at all, and its
 * backfill (picks any bodyweight exercise from the global pool) never put
 * the lost domain back. Fixed by sharing (not copying) GuaranteePassRunner's
 * `computeDomainCounts`/`isSafeDomainVictim` in both of this filter's removal
 * points: the first gear-pass loop, and the second "final validation" pass
 * (which would otherwise silently undo the first pass's protection).
 */

const rawExercise = (id: string, movementGroup: string, gearId?: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    execution_methods: [{ location: 'home', gearId: gearId ?? 'none' }],
    tags: [],
  } as unknown as Exercise);

const workoutExercise = (
  id: string,
  movementGroup: string,
  gearId: string | undefined,
  overrides: Partial<WorkoutExercise> = {},
): WorkoutExercise =>
  ({
    exercise: rawExercise(id, movementGroup, gearId),
    method: { gearId: gearId ?? 'none' },
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    score: 50,
    reasoning: [],
    ...overrides,
  } as unknown as WorkoutExercise);

const baseWorkout = (mainExercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 't', description: 'd', exercises: mainExercises,
    estimatedDuration: 20, structure: 'standard', difficulty: 2,
    mechanicalBalance: {} as any, stats: {} as any, isRecovery: false, totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyEssentialGearFilter — never strips the sole representative of a domain via the naked/gear check', () => {
  it('keeps a gear-requiring pull exercise when it is the ONLY pull exercise, instead of dropping it', () => {
    // resistance_band is deliberately NOT in ESSENTIAL_PARK_GEAR (pullup_bar/
    // dip_station/bench/low_bar/high_bar/step) so isGearFree's allowEssential
    // path does not save it — this must hit the domain-protection path, not
    // the essential-gear allowance.
    const solePull = workoutExercise('pull-1', 'vertical_pull', 'resistance_band');
    const push = workoutExercise('push-1', 'horizontal_push', 'none');
    const legs = workoutExercise('legs-1', 'squat', 'none');
    const workout = baseWorkout([solePull, push, legs]);

    applyEssentialGearFilter(workout, new Set(), [], 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    expect(mains.some(e => e.exercise.id === 'pull-1')).toBe(true);
    const kept = mains.find(e => e.exercise.id === 'pull-1')!;
    expect(kept.reasoning).toContain('naked_filter:kept_sole_domain_representative_despite_gear');
  });

  it('still removes a gear-requiring exercise when its domain has another representative (regression guard — the fix must not become "never remove gear")', () => {
    const gearPull = workoutExercise('pull-1', 'vertical_pull', 'resistance_band');
    const nakedPull = workoutExercise('pull-2', 'horizontal_pull', 'none');
    const push = workoutExercise('push-1', 'horizontal_push', 'none');
    const workout = baseWorkout([gearPull, nakedPull, push]);

    applyEssentialGearFilter(workout, new Set(), [], 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    // pull-1 required gear and pull has another representative (pull-2) — safe to remove.
    expect(mains.some(e => e.exercise.id === 'pull-1')).toBe(false);
    expect(mains.some(e => e.exercise.id === 'pull-2')).toBe(true);
  });

  it('the second "final validation" pass does not undo the first pass\'s protection', () => {
    // Only 3 main exercises total (at MIN_EXERCISES floor) so the backfill
    // path is not triggered — isolates the final-validation loop specifically.
    const solePull = workoutExercise('pull-1', 'vertical_pull', 'resistance_band');
    const push = workoutExercise('push-1', 'horizontal_push', 'none');
    const legs = workoutExercise('legs-1', 'squat', 'none');
    const workout = baseWorkout([solePull, push, legs]);

    applyEssentialGearFilter(workout, new Set(), [], 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    expect(mains).toHaveLength(3);
    expect(mains.some(e => e.exercise.id === 'pull-1')).toBe(true);
  });

  it('end-to-end via applyFlowRegression (the real observed path): sole pull survives the flow/easy bolt', () => {
    const solePull = workoutExercise('pull-1', 'vertical_pull', 'resistance_band', {
      exercise: rawExercise('pull-1', 'vertical_pull', 'resistance_band'),
    } as any);
    const push = workoutExercise('push-1', 'horizontal_push', 'none');
    const legs = workoutExercise('legs-1', 'squat', 'none');
    const workout = baseWorkout([solePull, push, legs]);

    applyFlowRegression(workout, new Map(), [], new Set(), 'home');

    const mains = workout.exercises.filter(e => e.exerciseRole === 'main');
    expect(mains.some(e => e.exercise.movementGroup === 'vertical_pull' || e.exercise.id === 'pull-1')).toBe(true);
  });
});
