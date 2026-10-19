/** Planned run (RunWorkout from the running program) → draft parts. */
import type { RunWorkout } from '@/features/workout-engine/players/running/types/run-workout.type';
import type { GenerationInput, GenerationOutput, LegSummary } from '@/lib/generation-review/types';
import { profileInput } from './profile';

export function plannedRunParts(w: RunWorkout): { input: GenerationInput; output: GenerationOutput } {
  const legs: LegSummary[] = (w.blocks ?? []).slice(0, 30).map((b) => ({
    activity: b.type === 'walk' || b.type === 'recovery' ? 'walk' : 'run',
    distanceM: typeof b.distanceMeters === 'number' ? Math.round(b.distanceMeters) : null,
    minutes: typeof b.durationSeconds === 'number' ? Math.round((b.durationSeconds / 60) * 10) / 10 : null,
  }));
  const known = legs.filter((l) => typeof l.minutes === 'number');
  return {
    input: { ...profileInput(), requestedActivity: 'run' },
    output: {
      title: typeof w.title === 'string' ? w.title.slice(0, 120) : null,
      planActivity: 'run',
      totalMinutes: known.length === legs.length && legs.length ? Math.round(known.reduce((s, l) => s + (l.minutes ?? 0), 0)) : null,
      exercises: [],
      legs,
      stations: [],
      route: null,
    },
  };
}
