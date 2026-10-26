/**
 * The program-path choice as the rest of the strength pipeline reads it (sessionStorage).
 *
 * Moved verbatim out of src/app/onboarding-new/program-path/page.tsx so the strength questionnaire
 * v3 entry (enable_strength_quiz_v3), which skips the goal screen, writes the SAME keys in the same
 * shape: assessment-visual, assessment-path-config and onboarding-sync stay unchanged.
 *
 * `onboarding_program_path` is a JSON array (priority = array order);
 * assessment-path-config.service.ts's getProgramPathListFromStorage() reads this shape, with a
 * back-compat guard for the legacy bare-string shape still written by mini-domain-assessment.ts's
 * single-domain top-up flow.
 */
import type { ExerciseWishlistEntry } from '@/features/user/core/types/user.types';
import type { ProgramCardId } from './program-card-selection';
import { FULL_BODY_ID, toggleMuscleSelection, toPersistedMuscleFocus } from './muscle-selection';

export function persistProgramPathSelection(
  cardOrder: ProgramCardId[],
  muscleIds: string[],
  skillIds: string[],
  wishlist: ExerciseWishlistEntry[],
): void {
  if (typeof window === 'undefined') return;
  if (cardOrder.length > 0) {
    sessionStorage.setItem('onboarding_program_path', JSON.stringify(cardOrder));
  }
  sessionStorage.setItem('onboarding_muscle_focus', JSON.stringify(muscleIds));
  sessionStorage.setItem('onboarding_skill_focus', JSON.stringify(skillIds));
  sessionStorage.setItem('onboarding_exercise_wishlist', JSON.stringify(wishlist));
}

/**
 * The legacy screen's "עיצוב ושרירים → כל הגוף" choice with nothing else picked: the body_focus card,
 * the full-body chip (which persists as all four packages), no skills, no wishlist. assessment-path-config
 * derives activeProgramId 'full_body' from it.
 */
export const FULL_BODY_PROGRAM_SELECTION: {
  cards: ProgramCardId[];
  muscles: string[];
  skills: string[];
  wishlist: ExerciseWishlistEntry[];
} = {
  cards: ['body_focus'],
  muscles: toPersistedMuscleFocus(toggleMuscleSelection([], FULL_BODY_ID)),
  skills: [],
  wishlist: [],
};

/** Writes FULL_BODY_PROGRAM_SELECTION through the same writer the legacy screen uses. */
export function persistFullBodyProgramSelection(): void {
  const s = FULL_BODY_PROGRAM_SELECTION;
  persistProgramPathSelection(s.cards, s.muscles, s.skills, s.wishlist);
}
