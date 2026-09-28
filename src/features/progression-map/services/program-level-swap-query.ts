/**
 * program-level-swap-query.ts — the 🔄 swap pill's data source.
 *
 * Finds every OTHER exercise tagged to the same (programId, level) pair as a
 * given tree node — a different filter axis from the existing swap drawer's
 * two tabs (base_movement_id ±3 levels / movementGroup ±3 levels): this one
 * is an EXACT-level, cross-movement-family membership check, which can span
 * different base_movement_id values on purpose (a leaf program's ladder
 * already does, by design — see build-skill-tree.service.ts).
 *
 * Round 10 fix — the "+N" badge (siblingCount, build-skill-tree.service.ts)
 * and this list used to disagree (badge said "+6", sheet listed 3). Root
 * cause, traced (not guessed): this function used to ALSO filter by
 * exerciseHasLocation(location) and await selectExecutionMethodWithBrand(...)
 * — the badge applies NEITHER, it's pure targetPrograms membership. The
 * method-selector's fallback loop only accepts a 'fixed_equipment' method
 * (the dominant gear type for outdoor/park exercises — pull-up bars,
 * parallel bars) when `park?.gymEquipment` is truthy — never true with
 * park=null, which is what EVERY call site of that function in this entire
 * app passes (confirmed — no exception anywhere in the codebase). So any
 * candidate whose only park-location method needed fixed equipment was
 * silently dropped. Not gear-personalization (userProfile is never read
 * inside that function) — a structural gap in a shared selector this
 * feature borrowed from the existing swap drawer's fetchers. Fixing that
 * selector itself is out of scope here (it's shared with unrelated swap
 * surfaces — ExerciseReplacementModal, useSwapAll's swap-all flow —
 * touching it risks regressing those); fixed locally instead.
 *
 * Inclusion now EXACTLY matches the badge: targetPrograms membership only,
 * nothing else — so the count can never diverge again. Execution-method
 * selection for the card's gear badges now uses findMethodForLocation
 * (exercise.types.ts) — the same park/gear-agnostic resolver
 * resolveTreeNodeImage already leans on for node images — instead of the
 * async brand/park pipeline. It never rejects a candidate outright (worst
 * case: "any method with media", or the exercise's first method); the one
 * theoretical case it can't handle — an exercise with a literally EMPTY
 * execution_methods array — gets a benign placeholder method instead of
 * being dropped, so a membership match is always included, no exceptions.
 *
 * `park`/`userProfile` stay in the signature (every call site already
 * passes them) even though the simplified selection no longer reads
 * them — removing them would mean touching ProgramLevelSwapSheetProps and
 * its one caller for no functional gain; harmless to keep as of now.
 *
 * Imported from the specific submodules, NOT the '@/features/content/exercises'
 * barrel — that barrel re-exports ExerciseEditorForm.tsx (JSX), which this
 * repo's vitest config (plain node env, no JSX transform) cannot parse. Same
 * pitfall + same fix already documented at resolve-tree-node-image.ts,
 * program-groups.utils.ts. This file previously had no test of its own so
 * the barrel import went unnoticed; adding one this round is what surfaced it.
 */
import { Exercise, ExecutionLocation, ExecutionMethod, findMethodForLocation } from '@/features/content/exercises/core/exercise.types';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';

export interface SameLevelExerciseOption {
  exercise: Exercise;
  /** Gear-matched method for the caller's location — same shape ExerciseReplacementModal uses for its gear badges. */
  selectedExecutionMethod: ExecutionMethod;
}

/** Used only for the rare exercise with a literally empty execution_methods array — see file header. */
const EMPTY_METHOD_PLACEHOLDER: ExecutionMethod = {
  location: 'park',
  requiredGearType: 'improvised',
  media: {},
};

/**
 * All exercises (other than `excludeExerciseId`) whose targetPrograms array
 * contains an entry matching {programId, level} exactly.
 *
 * `pool` lets a caller that already has the exercise corpus in memory (e.g.
 * the Tree screen, via useExerciseLibraryStore) skip a second Firestore read
 * — mirrors getAlternativeExercises' own `pool` parameter.
 */
export async function getSameProgramLevelExercises(
  programId: string,
  level: number,
  excludeExerciseId: string,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile,
  pool?: Exercise[],
): Promise<SameLevelExerciseOption[]> {
  const allExercises = pool && pool.length > 0 ? pool : await getAllExercises();
  const result: SameLevelExerciseOption[] = [];

  for (const ex of allExercises) {
    if (ex.id === excludeExerciseId) continue;
    const matchesLevel = ex.targetPrograms?.some(
      (tp) => tp.programId === programId && tp.level === level,
    );
    if (!matchesLevel) continue;

    const selectedMethod = findMethodForLocation(ex, location) ?? EMPTY_METHOD_PLACEHOLDER;
    result.push({ exercise: ex, selectedExecutionMethod: selectedMethod });
  }

  return result;
}
