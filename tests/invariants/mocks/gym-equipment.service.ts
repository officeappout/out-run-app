/**
 * MOCK of @/features/content/equipment/gym/core/gym-equipment.service — overrides
 * getAllGymEquipment to replay the frozen corpus (+ preserves the registerGearAlias
 * side-effect the real provider performs). See README.md.
 */
export * from '../../../src/features/content/equipment/gym/core/gym-equipment.service';
import { CORPUS } from '../fixtures';
import { registerGearAlias } from '../../../src/features/workout-engine/shared/utils/gear-mapping.utils';
import type { GymEquipment } from '../../../src/features/content/equipment/gym/core/gym-equipment.types';

export async function getAllGymEquipment(): Promise<GymEquipment[]> {
  const items = CORPUS.gymEquipment as GymEquipment[];
  for (const item of items) registerGearAlias(item.id, item.iconKey, undefined, item.name);
  return items;
}
