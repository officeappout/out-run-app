/**
 * Strength sets actually done in one session — PURE. The completion write
 * (useActivitySync) and the summary's live flame level both count them this way:
 * the runner's raw log when present (one confirmed set per entry), else the main /
 * superset exercises' sets.
 */
import type { CompletedExercise } from './summary.utils';

export interface LoggedSetEntry {
  confirmedReps: number[];
}

export function countLoggedStrengthSets(
  rawExerciseLog: readonly LoggedSetEntry[] | undefined | null,
  completedExercises: readonly CompletedExercise[],
): number {
  if (rawExerciseLog && rawExerciseLog.length > 0) {
    return rawExerciseLog.reduce((sum, entry) => sum + entry.confirmedReps.length, 0);
  }
  return completedExercises
    .filter((ex) => ex.category === 'main' || ex.category === 'superset')
    .reduce((sum, ex) => sum + ex.sets.length, 0);
}
