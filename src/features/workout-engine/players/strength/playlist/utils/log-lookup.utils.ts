/**
 * log-lookup.utils.ts — Indexes the workout exercise log and exposes
 * per-exercise lookup helpers.
 *
 * Extracted from WorkoutPlaylist.tsx.  The same builder is consumed by
 * the runner's header pills (eliminating the duplicate inline scan) and
 * by the preview drawer's per-card stats.
 */

import type { WorkoutPlan } from '@/features/parks';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import type { FlatExercise } from '../types';

/** Map key = `${exerciseId}::${segmentId}` */
export type LogLookup = Map<string, ExerciseResultLog>;

export function buildLogLookup(log: ExerciseResultLog[]): LogLookup {
  const map: LogLookup = new Map();
  log.forEach((entry) => {
    map.set(`${entry.exerciseId}::${entry.segmentId}`, entry);
  });
  return map;
}

export function getLogEntry(
  fe: FlatExercise,
  workout: WorkoutPlan,
  lookup: LogLookup,
): ExerciseResultLog | undefined {
  const segId =
    workout.segments[fe.segmentIndex]?.id || String(fe.segmentIndex);
  return lookup.get(`${fe.exercise.id}::${segId}`);
}

/**
 * Returns an array of length `fe.sets` where each slot is either the
 * confirmed rep count for that set or `null` if the set has not been
 * logged yet.
 */
export function getLoggedReps(
  fe: FlatExercise,
  workout: WorkoutPlan,
  lookup: LogLookup,
): (number | null)[] {
  const entry = getLogEntry(fe, workout, lookup);
  if (!entry) return new Array(fe.sets).fill(null);
  return Array.from({ length: fe.sets }, (_, i) => entry.confirmedReps[i] ?? null);
}

/**
 * Side-specific variant of `getLoggedReps` for unilateral exercises.
 */
export function getLoggedRepsSide(
  fe: FlatExercise,
  workout: WorkoutPlan,
  lookup: LogLookup,
  side: 'right' | 'left',
): (number | null)[] {
  const entry = getLogEntry(fe, workout, lookup);
  if (!entry) return new Array(fe.sets).fill(null);
  const arr = side === 'right' ? entry.confirmedRepsRight : entry.confirmedRepsLeft;
  if (!arr) return new Array(fe.sets).fill(null);
  return Array.from({ length: fe.sets }, (_, i) => arr[i] ?? null);
}
