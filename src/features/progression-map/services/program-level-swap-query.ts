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
 * Confirmed (Phase 1 research) that no existing function does this: the only
 * place the predicate already exists is an inline, unexported admin-table
 * filter (admin/exercises/page.tsx) — not reachable from the mobile app, not
 * connected to the swap stack. This is new, modeled on the same gear/location
 * check exercise-replacement.service.ts's getExerciseVariations/
 * getAlternativeExercises both apply (per the founder's explicit decision to
 * stay consistent with the park-everywhere direction), but WITHOUT
 * smartSelect3's cap-at-3 — the swap pill needs the true full sibling list,
 * not a diversity-capped top 3, and there's no lower/same/higher bucketing to
 * do since every candidate is the same level by construction.
 */
import { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises';
import { getAllExercises } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { selectExecutionMethodWithBrand } from '@/features/workout-engine/generator/services/execution-method-selector.service';

export interface SameLevelExerciseOption {
  exercise: Exercise;
  /** Gear-matched method for the caller's location — same shape ExerciseReplacementModal uses for its gear badges. */
  selectedExecutionMethod: ExecutionMethod;
}

function exerciseHasLocation(exercise: Exercise, location: ExecutionLocation): boolean {
  if (!exercise.execution_methods?.length) return false;
  return exercise.execution_methods.some(
    (m) => m.location === location || m.locationMapping?.includes(location),
  );
}

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

    if (!ex.execution_methods?.length) continue;
    if (!exerciseHasLocation(ex, location)) continue;

    const selectedMethod = await selectExecutionMethodWithBrand(ex, location, park, userProfile);
    if (!selectedMethod) continue;

    result.push({ exercise: ex, selectedExecutionMethod: selectedMethod });
  }

  return result;
}
