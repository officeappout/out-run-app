/**
 * Parks Service for Authority Managers
 * Thin wrapper over core parks.service.ts with admin-specific logic:
 *   - Audit logging
 *   - Edit request workflow for authority managers
 *   - Content approval status
 */
import { serverTimestamp } from 'firebase/firestore';

export {
  getAllParks,
  getParksByAuthority,
  getParksByNeighborhood,
  getPark,
  deletePark,
  approvePark,
  fetchRealParks,
} from '@/features/parks/core/services/parks.service';

import { getPark } from '@/features/parks/core/services/parks.service';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Park } from '@/types/admin-types';
import { logAction } from './audit.service';
import { createEditRequest } from './edit-requests.service';
import { checkUserRole } from './auth.service';
import { buildParkUpdateFields } from './park-update-fields';
export { buildParkUpdateFields } from './park-update-fields';

const PARKS_COLLECTION = 'parks';

/**
 * Sanitize park data before saving to Firestore
 */
function sanitizeParkData(
  data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>,
  contentStatus: 'pending_review' | 'published' = 'published'
): any {
  return {
    name: data.name ?? '',
    city: (data as any).city ?? '',
    description: data.description ?? '',
    location: data.location ?? { lat: 0, lng: 0 },
    image: data.image ?? null,
    // Persist the Bunny park photo (imageUrl) + multi-image array too — previously
    // only `image` was saved, so an admin re-save silently wiped the real Bunny
    // photo and reverted the park to its legacy Firebase cover.
    imageUrl: data.imageUrl ?? null,
    images: Array.isArray(data.images) ? data.images : [],
    facilityType: (data as any).facilityType ?? null,
    sportTypes: Array.isArray((data as any).sportTypes) ? (data as any).sportTypes : [],
    featureTags: Array.isArray((data as any).featureTags) ? (data as any).featureTags : [],
    hasWaterFountain: (data as any).hasWaterFountain ?? false,
    isDogFriendly: (data as any).isDogFriendly ?? false,
    courtType: (data as any).courtType ?? null,
    natureType: (data as any).natureType ?? null,
    communityType: (data as any).communityType ?? null,
    urbanType: (data as any).urbanType ?? null,
    terrainType: (data as any).terrainType ?? null,
    environment: (data as any).environment ?? null,
    facilities: Array.isArray(data.facilities) ? data.facilities : [],
    gymEquipment: Array.isArray(data.gymEquipment) ? data.gymEquipment : [],
    amenities: data.amenities ?? null,
    authorityId: data.authorityId ?? null,
    neighborhoodId: (data as any).neighborhoodId ?? null,
    neighborhoodName: (data as any).neighborhoodName ?? null,
    status: data.status ?? 'open',
    contentStatus,
    published: contentStatus === 'published',
    publishedAt: contentStatus === 'published' ? serverTimestamp() : null,
    createdByUser: (data as any).createdByUser ?? null,
    origin: (data as any).origin ?? (contentStatus === 'published' ? 'super_admin' : 'authority_admin'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/**
 * Create a new park with admin audit trail.
 * Authority managers get pending_review status; super admins publish directly.
 */
export async function createPark(
  data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>,
  adminInfo?: { adminId: string; adminName: string },
  options?: { forcePendingReview?: boolean }
): Promise<string> {
  try {
    let contentStatus: 'pending_review' | 'published' = 'published';

    if (options?.forcePendingReview) {
      contentStatus = 'pending_review';
    } else if (adminInfo) {
      const roleInfo = await checkUserRole(adminInfo.adminId);
      if (roleInfo.isAuthorityManager && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) {
        contentStatus = 'pending_review';
      }
    }

    const sanitized = sanitizeParkData(data, contentStatus);
    const docRef = await addDoc(collection(db, PARKS_COLLECTION), sanitized);
    const parkId = docRef.id;

    if (contentStatus === 'pending_review' && adminInfo) {
      let userName = adminInfo.adminName;
      let userEmail: string | undefined;
      try {
        const { getUserFromFirestore } = await import('@/lib/firestore.service');
        const profile = await getUserFromFirestore(adminInfo.adminId);
        userName = profile?.core?.name || adminInfo.adminName;
        userEmail = profile?.core?.email;
      } catch { /* non-fatal */ }

      await createEditRequest({
        entityType: 'park',
        entityId: parkId,
        entityName: data.name ?? 'פארק חדש',
        originalData: null,
        newData: sanitized,
        requestedBy: adminInfo.adminId,
        requestedByName: userName,
        requestedByEmail: userEmail,
        authorityId: data.authorityId,
      });
    }

    return parkId;
  } catch (error) {
    console.error('Error creating park:', error);
    throw error;
  }
}

/**
 * Update a park with admin audit trail.
 * Authority managers create edit requests; super admins update directly.
 */
export async function updatePark(
  parkId: string,
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const park = await getPark(parkId);
    if (!park) throw new Error('Park not found');

    const parkName = park.name || parkId;

    if (adminInfo) {
      const roleInfo = await checkUserRole(adminInfo.adminId);

      if (roleInfo.isAuthorityManager && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) {
        let userName = adminInfo.adminName;
        let userEmail: string | undefined;
        try {
          const { getUserFromFirestore } = await import('@/lib/firestore.service');
          const userProfile = await getUserFromFirestore(adminInfo.adminId);
          userName = userProfile?.core?.name || adminInfo.adminName;
          userEmail = userProfile?.core?.email;
        } catch { /* non-fatal */ }

        await createEditRequest({
          entityType: 'park',
          entityId: parkId,
          entityName: parkName,
          originalData: park,
          newData: data,
          requestedBy: adminInfo.adminId,
          requestedByName: userName,
          requestedByEmail: userEmail,
          authorityId: park.authorityId,
        });
        return;
      }
    }

    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const updateData: any = { updatedAt: serverTimestamp(), ...buildParkUpdateFields(data) };
    let details = 'Updated park';

    if (data.status !== undefined) {
      const oldStatus = park?.status || 'unknown';
      details = `Status changed from "${oldStatus}" to "${data.status}"`;
    }

    await updateDoc(docRef, updateData);

    if (adminInfo && (data.status !== undefined || Object.keys(updateData).length > 1)) {
      // Build before/after snapshots covering ONLY the fields that changed.
      // Keeps the audit row compact while still providing a full diff
      // for the compliance officer's review.
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      const trackedKeys = Object.keys(updateData).filter((k) => k !== 'updatedAt');
      for (const key of trackedKeys) {
        oldValue[key] = (park as any)?.[key] ?? null;
        newValue[key] = (updateData as any)[key];
      }

      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Park',
        targetId: parkId,
        details: `${details} - ${parkName}`,
        oldValue,
        newValue,
      });
    }
  } catch (error) {
    console.error('Error updating park:', error);
    throw error;
  }
}
