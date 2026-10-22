/**
 * Programs hidden from NEW selection until their content is refined
 * (owner's request): muscle-up, handstand and human flag.
 *
 * One shared set so every surface hides the same programs — the onboarding
 * skill picker (legacy + v2) and the progress screen. Hiding is
 * presentation-only for new choices: a user who already has one of these as
 * an active program keeps it, its track and its workouts untouched.
 *
 * Lives in src/lib/ (like progression-map-config.ts) so onboarding and
 * progression features can both import it without a cross-domain import.
 */
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';

export const HIDDEN_PROGRAM_SLUGS: ReadonlySet<string> = new Set([
  'muscle_up',
  'handstand',
  'human_flag',
]);

/** Raw Firestore doc ids of the hidden programs — resolves even before the
 *  id→slug map (buildIdToSlugMapFromPrograms) has been built. */
const HIDDEN_PROGRAM_IDS: ReadonlySet<string> = new Set([
  'fTLWzjP9gH2VNpamyCZF', // muscle_up
  'IOfBZFeorTTDkcz3tOA6', // handstand
  'EtY8YCol0qpF6DzgcTx1', // human_flag
]);

/** Accepts a slug ('muscle_up') or a raw Firestore program id. */
export function isHiddenProgram(idOrSlug: string | null | undefined): boolean {
  if (!idOrSlug) return false;
  if (HIDDEN_PROGRAM_SLUGS.has(idOrSlug) || HIDDEN_PROGRAM_IDS.has(idOrSlug)) return true;
  // Only raw doc ids need the id→slug map; a slug that isn't hidden is done.
  const looksLikeDocId = idOrSlug.length > 15 && !idOrSlug.includes('_');
  return looksLikeDocId && HIDDEN_PROGRAM_SLUGS.has(resolveToSlug(idOrSlug));
}

/** Minimal exercise shape — keeps this module free of a content-domain import. */
export interface ProgramTaggedExercise {
  targetPrograms?: ReadonlyArray<{ programId?: string | null } | null> | null;
  programIds?: ReadonlyArray<string | null> | null;
}

/**
 * An exercise that belongs ONLY to hidden programs (e.g. tagged muscle_up and
 * nothing else). Same "exclusive" rule as the generator's skill gate: an
 * exercise shared with any visible program (muscle_up + pull) stays visible,
 * and an untagged exercise is never hidden.
 */
export function isHiddenSkillExercise(ex: ProgramTaggedExercise | null | undefined): boolean {
  if (!ex) return false;
  const ids = [
    ...(ex.targetPrograms ?? []).map((tp) => tp?.programId),
    ...(ex.programIds ?? []),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return false;
  return ids.every((id) => isHiddenProgram(id));
}
