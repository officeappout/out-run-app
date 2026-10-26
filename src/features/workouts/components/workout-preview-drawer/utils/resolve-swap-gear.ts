/**
 * resolve-swap-gear — gear for a swap target location, from the SAME source as generation.
 * Extracted verbatim from useSwapAll so the legacy loop and the location-gate plan share it.
 * `chosenParkId` (chosen-park.ts): a park / street switch uses THAT park's equipment; the nearest
 * equipped park only when none was chosen or the chosen one lists no equipment.
 */
import type { ExecutionLocation } from '@/features/content/exercises';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { normalizeEquipmentArray } from '@/features/workout-engine/core/middleware/InputSanitizerMiddleware';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { resolveWorkoutContext } from '@/features/workout-engine/services/workout-context-resolver';
import { resolveChosenParkEquipmentIds } from '@/features/workout-engine/services/park-equipment-resolver';

export async function resolveSwapGear(
  userProfile: UserFullProfile,
  newLocation: ExecutionLocation,
  chosenParkId: string | null = null,
): Promise<ReturnType<typeof normalizeEquipmentArray>> {
  await ensureEquipmentCachesLoaded();
  const gymList = await getAllGymEquipment();
  let parkGear: string[] | undefined;
  if (newLocation === 'park' || newLocation === 'street') {
    const chosen = chosenParkId ? await resolveChosenParkEquipmentIds(chosenParkId) : [];
    parkGear = chosen.length > 0 ? chosen : (await resolveWorkoutContext(userProfile, newLocation, {})).availableGear;
  }
  return normalizeEquipmentArray(userProfile, newLocation, parkGear, gymList);
}
