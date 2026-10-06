/**
 * park-completeness.util — the single source of truth for `needsFacilityDetails`.
 *
 * David's decision (06.10.2026, OSM-import Stage 1): this field must be
 * SERVER-COMPUTED on every write, never settable by a caller directly —
 * `true` means "missing a real photo or a real gymEquipment entry," `false`
 * means both are present. Every write path to `parks` must call this
 * immediately before its write, same convention as buildValidatedDoc for
 * the route-collections (axioms.md §23).
 */
import type { ParkGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

export interface ParkCompletenessInput {
  image?: unknown;
  images?: unknown;
  gymEquipment?: ParkGymEquipment[] | unknown;
}

function hasRealPhoto(data: ParkCompletenessInput): boolean {
  if (typeof data.image === 'string' && data.image.trim().length > 0) return true;
  if (Array.isArray(data.images) && data.images.some((v) => typeof v === 'string' && v.trim().length > 0)) return true;
  return false;
}

function hasRealGymEquipment(data: ParkCompletenessInput): boolean {
  if (!Array.isArray(data.gymEquipment)) return false;
  return data.gymEquipment.some(
    (e) => e && typeof e === 'object' && typeof (e as ParkGymEquipment).equipmentId === 'string' && (e as ParkGymEquipment).equipmentId.trim().length > 0,
  );
}

/** `true` = incomplete (needs facility details), `false` = fully documented. */
export function computeNeedsFacilityDetails(data: ParkCompletenessInput): boolean {
  return !(hasRealPhoto(data) && hasRealGymEquipment(data));
}
