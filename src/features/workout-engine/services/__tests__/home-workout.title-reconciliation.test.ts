import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { WorkoutExercise } from '../../logic/WorkoutGenerator';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutMetadataContext, ResolvedWorkoutMetadata } from '../workout-metadata.service';

/**
 * Snapshot-seam bug (discovered tracing the desk-workout constraint,
 * home-workout.service.ts:~1140): resolveWorkoutMetadata picks title/
 * description from a SNAPSHOT of workout.exercises taken before the
 * desk-workout filter, post-cut promise validation, and sortAndPair run.
 * Demonstrated failure: an office_worker/student persona in the 12:00-14:00
 * lunch window gets desk/chair-themed title+description (workout-
 * metadata.service.ts's +30 desk-reset boost for that persona/window); the
 * desk-workout filter then tries to keep only desk-friendly exercises, but
 * when fewer than 2 survive it silently reverts to the ORIGINAL non-desk
 * pool (home-workout.service.ts:~1160) — leaving a title/description that
 * promises a chair workout over an exercise list that is a full-body plan.
 *
 * These tests exercise reconcileWorkoutTitleWithFinalExercises, the exact
 * function generateHomeWorkoutTrio calls after every exercise-list mutation
 * settles (sortAndPair is the "ABSOLUTE last mutation" per its own comment).
 * Not a re-implementation — the production loop calls this same export.
 */

vi.mock('../workout-metadata.service', async () => {
  const actual = await vi.importActual<typeof import('../workout-metadata.service')>(
    '../workout-metadata.service',
  );
  return { ...actual, resolveWorkoutMetadata: vi.fn() };
});

import { resolveWorkoutMetadata } from '../workout-metadata.service';
import {
  resolveCategoryFromExercises,
  reconcileWorkoutTitleWithFinalExercises,
} from '../home-workout.service';

const mockResolveWorkoutMetadata = vi.mocked(resolveWorkoutMetadata);

const rawExercise = (id: string, tags: string[], primaryMuscle = 'core'): Exercise =>
  ({ id, name: { he: id, en: id }, primaryMuscle, tags } as unknown as Exercise);

const workoutExercise = (id: string, tags: string[], primaryMuscle = 'core'): WorkoutExercise =>
  ({
    exercise: rawExercise(id, tags, primaryMuscle),
    method: {},
    sets: 3,
    reps: 10,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    score: 50,
    reasoning: [],
  } as unknown as WorkoutExercise);

// Mirrors home-workout.service.ts's own desk-friendly pool: majority
// mobility-tagged → resolveCategoryFromExercises computes category='mobility'.
const deskFriendlyExercises: WorkoutExercise[] = [
  workoutExercise('stretch-1', ['mobility', 'chair_stretch']),
  workoutExercise('stretch-2', ['mobility', 'desk_mobility']),
  workoutExercise('stretch-3', ['mobility']),
];

// A typical full-body/strength pool — no mobility majority → category='general'.
const fullBodyExercises: WorkoutExercise[] = [
  workoutExercise('pushup', ['strength'], 'chest'),
  workoutExercise('pullup', ['strength'], 'back'),
  workoutExercise('squat', ['strength'], 'legs'),
  workoutExercise('plank', ['core'], 'core'),
];

const baseWorkout = (exercises: WorkoutExercise[]): GeneratedWorkout =>
  ({
    title: 'אימון כיסא קליל',
    description: 'כמה דקות של מתיחות ליד השולחן',
    exercises,
    estimatedDuration: 15,
    structure: 'standard',
    difficulty: 2,
    mechanicalBalance: {} as any,
    stats: {} as any,
    isRecovery: false,
    totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

// The context the (desk-themed) title/description were originally picked
// against — i.e. optionMetaCtx as resolved from the PRE-mutation snapshot,
// which for an office_worker/student in the lunch window resolved to the
// desk-friendly pool's category.
const priorDeskCtx: WorkoutMetadataContext = {
  persona: 'office_worker',
  timeOfDay: 'afternoon',
  category: 'mobility',
  // All 3 deskFriendlyExercises default to primaryMuscle='core' (100% share)
  // — matches what resolveCategoryFromExercises actually computes for them.
  dominantMuscle: 'core',
  categoryLabel: 'ניידות',
  durationMinutes: 15,
  difficulty: 2,
} as WorkoutMetadataContext;

const fullBodyMetadata: ResolvedWorkoutMetadata = {
  title: 'אימון כוח מלא',
  description: 'סבב תרגילי כוח לכל הגוף',
  aiCue: 'קדימה!',
  logicCue: null,
  source: 'firestore',
  bundleId: 'bundle-full-body',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockResolveWorkoutMetadata.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('resolveCategoryFromExercises', () => {
  it('a majority-mobility exercise pool resolves to category="mobility" (the desk-friendly case)', () => {
    const meta = resolveCategoryFromExercises(deskFriendlyExercises, 'standard');
    expect(meta.category).toBe('mobility');
  });

  it('a strength/full-body pool resolves to a DIFFERENT category than the desk-friendly pool', () => {
    const deskMeta = resolveCategoryFromExercises(deskFriendlyExercises, 'standard');
    const fullBodyMeta = resolveCategoryFromExercises(fullBodyExercises, 'standard');
    expect(fullBodyMeta.category).not.toBe(deskMeta.category);
    expect(fullBodyMeta.category).toBe('general');
  });
});

describe('reconcileWorkoutTitleWithFinalExercises — the demonstrated desk-revert bug', () => {
  it('BUG scenario: desk-filter silently reverted to the non-desk pool (<2 desk-friendly ' +
     'exercises survived) — title/description are re-resolved to match what actually shipped', async () => {
    mockResolveWorkoutMetadata.mockResolvedValue(fullBodyMetadata);

    // workout.exercises is the FINAL, post-desk-filter-fallback list — the
    // original non-desk pool, kept because fewer than 2 desk exercises
    // survived (home-workout.service.ts:~1160's else branch).
    const workout = baseWorkout(fullBodyExercises);
    expect(workout.title).toBe('אימון כיסא קליל'); // still the stale desk-themed title, pre-fix

    const result = await reconcileWorkoutTitleWithFinalExercises(
      workout,
      priorDeskCtx,
      'balanced',
      {},
    );

    expect(result.reconciled).toBe(true);
    // The title now matches the delivered (full-body) exercises, not the
    // desk-themed copy the exercise list no longer represents.
    expect(workout.title).toBe(fullBodyMetadata.title);
    expect(workout.description).toBe(fullBodyMetadata.description);
    expect(result.newMetadataCtx?.category).toBe('general');
    expect(result.bundleId).toBe('bundle-full-body');

    // resolveWorkoutMetadata must be called with the CORRECTED category —
    // proves the reconciliation used the final exercises, not the stale ctx.
    expect(mockResolveWorkoutMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'general' }),
      'balanced',
      {},
    );
  });

  it('WORKING scenario: desk-filter succeeded (≥2 desk-friendly exercises survived) — ' +
     'final exercises match the category the title was picked for, no re-resolve happens', async () => {
    const workout = baseWorkout(deskFriendlyExercises);

    const result = await reconcileWorkoutTitleWithFinalExercises(
      workout,
      priorDeskCtx,
      'balanced',
      {},
    );

    expect(result.reconciled).toBe(false);
    expect(workout.title).toBe('אימון כיסא קליל'); // untouched — it was already correct
    expect(mockResolveWorkoutMetadata).not.toHaveBeenCalled();
  });

  it('an ordinary (non-desk) workout whose exercises never changed category is also a no-op — ' +
     'reconciliation does not add a spurious Firestore round-trip to the common path', async () => {
    const priorStrengthCtx: WorkoutMetadataContext = {
      ...priorDeskCtx,
      persona: null,
      category: 'general',
      dominantMuscle: undefined,
    };
    const workout = baseWorkout(fullBodyExercises);
    workout.title = 'אימון כוח מלא';

    const result = await reconcileWorkoutTitleWithFinalExercises(
      workout,
      priorStrengthCtx,
      'balanced',
      {},
    );

    expect(result.reconciled).toBe(false);
    expect(mockResolveWorkoutMetadata).not.toHaveBeenCalled();
  });
});
