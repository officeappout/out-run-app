/** GeneratedWorkout (home trio / Kelly) → draft input/output parts. */
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import type { GenerationInput, GenerationOutput } from '@/lib/generation-review/types';
import { summarizeExercises } from './workout';
import { profileInput, userGear } from './profile';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { whyLineOfWorkout, type WhyProfileSlice } from '@/features/workout-engine/services/split-decision/why-this-workout';

/** The overview's "why this workout" line for the log (never throws). */
function whyOf(workout: GeneratedWorkout, location: string | null | undefined): string | null {
  try {
    const profile = useUserStore.getState().profile as unknown as WhyProfileSlice | null;
    return whyLineOfWorkout({ workout, profile, location })?.slice(0, 160) ?? null;
  } catch {
    return null;
  }
}

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
      // The requested focus, else the split day the generator stamped ('full' is no
      // focus — a full-body day must still be balanced, STRENGTH_SINGLE_PATTERN).
      focus: ctx.focus ?? (workout.dayFocus && workout.dayFocus !== 'full' ? workout.dayFocus : null),
      ...(budgetLight ? { budget: { lightMode: true } } : {}),
    },
    output: {
      title: typeof workout.title === 'string' ? workout.title.slice(0, 120) : null,
      planActivity: 'strength',
      whyHe: whyOf(workout, location),
      totalMinutes: typeof workout.estimatedDuration === 'number' ? Math.round(workout.estimatedDuration) : null,
      exercises: summarizeExercises(workout.exercises, gear),
      legs: [],
      stations: [],
      route: null,
    },
  };
}
