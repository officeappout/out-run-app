/**
 * Pilot O4 (29.10.2026): "everything in the carousel, the relevant card first". On a day the
 * step goal is met, the carousel's steps slot (the safety-net suggestion) carries the "goal
 * reached" state, so the separate strip above the carousel drops its steps-only card.
 * Pure: the caller passes what the pre-workout carousel will render today.
 */

export interface StepsGoalSlotInput {
  /** HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED. */
  carouselOn: boolean;
  /** enable_home_v2 new user: the start slides are the whole carousel. */
  startOnly: boolean;
  /** Today's workout is done: the pre-workout carousel is hidden. */
  workoutDone: boolean;
  /** enable_home_v2 walker: the short-walk card replaces the steps card (dropStepsDuplicate). */
  v2Walker: boolean;
  suggestions: ReadonlyArray<{ generatorId: string }> | null | undefined;
}

export function isStepsGoalInCarousel(input: StepsGoalSlotInput): boolean {
  const { carouselOn, startOnly, workoutDone, v2Walker, suggestions } = input;
  if (!carouselOn || startOnly || workoutDone || v2Walker) return false;
  return !!suggestions?.some((s) => s.generatorId === 'safety-net');
}
