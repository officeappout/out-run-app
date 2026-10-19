/** GeneratedWorkout (home trio / Kelly) → draft input/output parts. */
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import type { GenerationInput, GenerationOutput } from '@/lib/generation-review/types';
import { summarizeExercises } from './workout';
import { profileInput, userGear } from './profile';

export interface StrengthCtx {
  /** 'home' / 'park' / 'office' / 'street' / 'gym' (other spellings → null). */
  location?: string | null;
  /** The place's gear when the generator resolved it (e.g. Kelly's park equipment). */
  placeGear?: string[] | null;
  targetMinutes?: number | null;
  focus?: string | null;
  generator?: string | null;
}

const LOCATIONS = ['home', 'park', 'street', 'office', 'gym'] as const;
function normalizeLocation(v: string | null | undefined): GenerationInput['location'] {
  return (LOCATIONS as readonly string[]).includes(v ?? '') ? (v as GenerationInput['location']) : null;
}

export function strengthParts(workout: GeneratedWorkout, ctx: StrengthCtx = {}): { input: GenerationInput; output: GenerationOutput } {
  const location = normalizeLocation(ctx.location);
  const gear = ctx.placeGear ?? userGear(location);
  const budgetLight = (workout as unknown as { budgetLight?: unknown }).budgetLight;
  return {
    input: {
      ...profileInput(),
      location,
      equipment: gear,
      targetMinutes: ctx.targetMinutes ?? null,
      focus: ctx.focus ?? null,
      ...(budgetLight ? { budget: { lightMode: true } } : {}),
    },
    output: {
      title: typeof workout.title === 'string' ? workout.title.slice(0, 120) : null,
      planActivity: 'strength',
      totalMinutes: typeof workout.estimatedDuration === 'number' ? Math.round(workout.estimatedDuration) : null,
      exercises: summarizeExercises(workout.exercises, gear),
      legs: [],
      stations: [],
      route: null,
    },
  };
}
