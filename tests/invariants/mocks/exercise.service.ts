/**
 * MOCK of @/features/content/exercises/core/exercise.service — wired via the
 * `paths` redirect in tests/invariants/tsconfig.json. Re-exports the real module
 * (relative path → not redirected) and overrides only the Firestore-reading
 * providers to replay the frozen corpus. See README.md.
 */
export * from '../../../src/features/content/exercises/core/exercise.service';
import { CORPUS } from '../fixtures';
import type { Exercise } from '../../../src/features/content/exercises/core/exercise.types';

export async function getAllExercises(): Promise<Exercise[]> {
  return CORPUS.exercises as Exercise[];
}
export async function getAllExercisesNoOrder(): Promise<Exercise[]> {
  return CORPUS.exercises as Exercise[];
}
