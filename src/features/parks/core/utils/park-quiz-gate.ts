/**
 * Pilot M12 (owner decision 31.10.2026, enable_pilot_decisions_v1): a park with fewer than 3
 * DIFFERENT equipment types can't be trusted to build a workout from, so a user with no strength
 * questionnaire result answers it before the park workout. PURE.
 */
export const MIN_PARK_EQUIPMENT_TYPES = 3;

/** Distinct non-empty equipment ids, or null when the park record carries no equipment list. */
export function distinctEquipmentTypes(park: { gymEquipment?: Array<{ equipmentId?: string | null }> | null }): number | null {
  if (!Array.isArray(park.gymEquipment)) return null;
  return new Set(park.gymEquipment.map((g) => g?.equipmentId).filter((id): id is string => !!id)).size;
}

/** Quiz first? Only when the count is known (an unknown list never blocks) and below the minimum. */
export function parkNeedsQuizFirst(
  park: { gymEquipment?: Array<{ equipmentId?: string | null }> | null },
  assessed: boolean,
  alreadyAsked: boolean,
): boolean {
  if (assessed || alreadyAsked) return false;
  const n = distinctEquipmentTypes(park);
  return n != null && n < MIN_PARK_EQUIPMENT_TYPES;
}
