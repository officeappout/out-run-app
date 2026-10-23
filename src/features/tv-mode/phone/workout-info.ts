import type { TvWorkoutInfo } from '../core/types';

/** The few fields of a generated workout the TV needs — structural, so tv-mode imports nothing from workout-engine. */
export interface WorkoutLike {
  title?: string;
  estimatedDuration?: number;
  exercises?: readonly unknown[];
}

export function workoutInfoFrom(w: WorkoutLike): TvWorkoutInfo {
  return {
    title: (w.title ?? '').trim(),
    kind: 'strength',
    durationMin: Math.max(0, Math.round(w.estimatedDuration ?? 0)),
    exerciseCount: w.exercises?.length ?? 0,
  };
}
