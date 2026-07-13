/**
 * park-equipment.util — park gymEquipment[] → normalized canonical gear ids (Phase א).
 *
 * PURE: the normalizer is injected (the caller passes `normalizeGearIds`), so this
 * module has no runtime dependency on gear-mapping/firebase and stays unit-testable.
 * ⚠️ The caller MUST `await ensureEquipmentCachesLoaded()` before invoking with the
 * real normalizer — Firestore doc-ids only translate once the equipment cache is warm.
 */

import type { ParkGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

export function parkGymEquipmentToGearIds(
  gymEquipment: ParkGymEquipment[] | undefined,
  normalize: (ids: string[]) => string[],
): string[] {
  const ids = (gymEquipment ?? []).map((e) => e.equipmentId).filter(Boolean);
  if (ids.length === 0) return [];
  return Array.from(new Set(normalize(ids)));
}
