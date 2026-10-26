/**
 * build-plan-deps — wires planLocationSwap's injected dependencies to the real services
 * (gear resolution, method selection, the replacement service). enable_location_gate_v1.
 */
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { selectMethodForContext } from '@/features/workout-engine/shared/utils/method-selection.utils';
import {
  exerciseHasLocation,
  getAlternativeExercises,
  getExerciseVariations,
} from '@/features/workout-engine/generator/services/exercise-replacement.service';
import { resolveSwapGear } from '../utils/resolve-swap-gear';
import type { SwapPlanDeps } from './plan-location-swap';

export async function buildSwapPlanDeps(
  userProfile: UserFullProfile,
  location: ExecutionLocation,
  pool: readonly Exercise[] | undefined,
  /** The park the user chose (chosen-park.ts); null → the nearest equipped park. */
  chosenParkId: string | null = null,
): Promise<SwapPlanDeps> {
  const gear = await resolveSwapGear(userProfile, location, chosenParkId);
  const poolArr = (pool ?? []) as Exercise[];
  return {
    pool: poolArr,
    hasLocation: exerciseHasLocation,
    selectMethod: (ex, loc) => selectMethodForContext(ex, loc, gear) ?? null,
    findCandidates: (we, rules, exclude, filter) => {
      const opts = { excludeIds: exclude, candidateFilter: filter, uncapped: true };
      // Goal / skill slots look only inside their own base_movement_id family.
      if (rules.pinned) {
        return getExerciseVariations(we.exercise, rules.level, location, null, userProfile, undefined, opts);
      }
      return getAlternativeExercises(
        we.exercise,
        rules.level,
        location,
        null,
        userProfile,
        undefined,
        new Set(exclude),
        poolArr,
        opts,
      );
    },
  };
}
