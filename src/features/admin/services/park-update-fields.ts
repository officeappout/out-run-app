import type { Park } from '@/types/admin-types';

/**
 * Field whitelist for `updatePark`'s partial Firestore update. Kept in its own
 * dependency-light module (no Firestore/React imports) so it's unit-testable
 * without mocking Firestore or pulling in the wider parks/map import chain —
 * see __tests__/park-update-fields.test.ts (regression coverage for the
 * `images` array being silently dropped on every save, fixed 10.09.2026).
 */
export function buildParkUpdateFields(
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>
): Record<string, any> {
  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name ?? '';
  if (data.city !== undefined) updateData.city = data.city ?? '';
  if (data.description !== undefined) updateData.description = data.description ?? '';
  if (data.location !== undefined) updateData.location = data.location;
  if (data.image !== undefined) updateData.image = data.image ?? null;
  if (data.images !== undefined) updateData.images = Array.isArray(data.images) ? data.images : null;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl ?? null;
  if ((data as any).facilityType !== undefined) updateData.facilityType = (data as any).facilityType ?? null;
  if ((data as any).sportTypes !== undefined) updateData.sportTypes = Array.isArray((data as any).sportTypes) ? (data as any).sportTypes : [];
  if ((data as any).featureTags !== undefined) updateData.featureTags = Array.isArray((data as any).featureTags) ? (data as any).featureTags : [];
  if ((data as any).hasWaterFountain !== undefined) updateData.hasWaterFountain = (data as any).hasWaterFountain ?? false;
  if ((data as any).isDogFriendly !== undefined) updateData.isDogFriendly = (data as any).isDogFriendly ?? false;
  if ((data as any).courtType !== undefined) updateData.courtType = (data as any).courtType ?? null;
  if (data.facilities !== undefined) updateData.facilities = Array.isArray(data.facilities) ? data.facilities : [];
  if (data.gymEquipment !== undefined) updateData.gymEquipment = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];
  if (data.amenities !== undefined) updateData.amenities = data.amenities ?? null;
  if (data.authorityId !== undefined) updateData.authorityId = data.authorityId ?? null;
  if ((data as any).neighborhoodId !== undefined) updateData.neighborhoodId = (data as any).neighborhoodId ?? null;
  if ((data as any).neighborhoodName !== undefined) updateData.neighborhoodName = (data as any).neighborhoodName ?? null;
  if (data.status !== undefined) updateData.status = data.status;
  return updateData;
}
