/**
 * resolve-swap-gear — gear for a swap target location, from the SAME source as generation.
 * Extracted verbatim from useSwapAll so the legacy loop and the location-gate plan share it.
 */
import type { ExecutionLocation } from '@/features/content/exercises';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { normalizeEquipmentArray } from '@/features/workout-engine/core/middleware/InputSanitizerMiddleware';
import { getAllGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { resolveWorkoutContext } from '@/features/workout-engine/services/workout-context-resolver';

export async function resolveSwapGear(
  userProfile: UserFullProfile,
  newLocation: ExecutionLocation,
): Promise<ReturnType<typeof normalizeEquipmentArray>> {
  await ensureEquipmentCachesLoaded();
  const gymList = await getAllGymEquipment();
  let parkGear: string[] | undefined;
  if (newLocation === 'park' || newLocation === 'street') {
    parkGear = (await resolveWorkoutContext(userProfile, newLocation, {})).availableGear;
  }
  return normalizeEquipmentArray(userProfile, newLocation, parkGear, gymList);
}
