/**
 * Pilot AG8: the park workout generated for the "fits you here" card can come
 * back empty (no machine passes today's domain gate and the bodyweight block
 * returns nothing, e.g. right after a workout). A card must never offer
 * "0 min · 0 exercises", so an empty result hides the card (pure helpers).
 */
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';

export interface GeneratedSize {
  durationMin: number;
  exerciseCount: number;
}

/** True when a generated workout has nothing to do. */
export function isEmptyGeneratedWorkout(w: GeneratedSize | null | undefined): boolean {
  if (!w) return false;
  return !(w.exerciseCount > 0) || !(w.durationMin > 0);
}

/** The suggestions without `hidden` (the empty park-workout card), same order. */
export function withoutHiddenCard(
  suggestions: readonly PlaceWorkoutSuggestion[],
  hidden: PlaceWorkoutSuggestion | null | undefined,
): PlaceWorkoutSuggestion[] {
  return hidden ? suggestions.filter((s) => s !== hidden) : [...suggestions];
}
