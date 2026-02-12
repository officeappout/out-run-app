/**
 * Parks Service for Authority Managers
 * Handles CRUD operations for parks with authority filtering
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Park, ParkStatus } from '@/types/admin-types';
import { logAction } from './audit.service';
import { createEditRequest } from './edit-requests.service';
import { checkUserRole } from './auth.service';

const PARKS_COLLECTION = 'parks';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Normalize park data with defaults
 */
function normalizePark(docId: string, data: any): Park {
  return {
    id: docId,
    name: data?.name ?? '',
    city: data?.city ?? '',
    description: data?.description ?? '',
    location: data?.location ?? { lat: 0, lng: 0 },
    image: data?.image ?? undefined,
    facilities: Array.isArray(data?.facilities) ? data.facilities : [],
    gymEquipment: Array.isArray(data?.gymEquipment) ? data.gymEquipment : undefined,
    amenities: data?.amenities ?? undefined,
    authorityId: data?.authorityId ?? undefined,
    status: (data?.status as ParkStatus) ?? 'open',
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
  };
}

/**
 * Get all parks (admin only - no filtering)
 */
export async function getAllParks(): Promise<Park[]> {
  try {
    const q = query(collection(db, PARKS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizePark(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching parks:', error);
    throw error;
  }
}

/**
 * Get parks by authority ID (for Authority Managers)
 * Gracefully handles missing Firebase index errors
 */
export async function getParksByAuthority(authorityId: string): Promise<Park[]> {
  try {
    const q = query(
      collection(db, PARKS_COLLECTION),
      where('authorityId', '==', authorityId),
      orderBy('name', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizePark(doc.id, doc.data()));
  } catch (error: any) {
    // Handle missing index error gracefully
    if (error?.code === 'failed-precondition' || error?.code === 'unavailable') {
      console.warn('[Parks Service] Firebase index not ready yet. Returning empty array. Please create the index in Firebase Console.');
      console.warn('[Parks Service] Required index: authorityId (ascending) + name (ascending)');
      // Return empty array instead of throwing - allows UI to continue gracefully
      return [];
    }
    console.error('Error fetching parks by authority:', error);
    // For other errors, still return empty array to prevent UI crashes
    return [];
  }
}

/**
 * Get a single park by ID
 */
export async function getPark(parkId: string): Promise<Park | null> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return normalizePark(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching park:', error);
    throw error;
  }
}

/**
 * Create a new park
 */
/**
 * Sanitize park data before saving to Firestore
 */
function sanitizeParkData(data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>): any {
  return {
    name: data.name ?? '',
    city: (data as any).city ?? '',
    description: data.description ?? '',
    location: data.location ?? { lat: 0, lng: 0 },
    image: data.image ?? null,
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
    status: data.status ?? 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function createPark(data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const sanitized = sanitizeParkData(data);
    const docRef = await addDoc(collection(db, PARKS_COLLECTION), sanitized);
    return docRef.id;
  } catch (error) {
    console.error('Error creating park:', error);
    throw error;
  }
}

/**
 * Update a park
 * For authority_manager: creates an edit request instead of direct update
 * For super_admin/system_admin: updates directly
 */
export async function updatePark(
  parkId: string,
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    // Get current park data
    const park = await getPark(parkId);
    if (!park) {
      throw new Error('Park not found');
    }

    const parkName = park.name || parkId;

    // Check user role if adminInfo is provided
    if (adminInfo) {
      const roleInfo = await checkUserRole(adminInfo.adminId);
      
      // If user is authority_manager (not super_admin/system_admin), create edit request
      if (roleInfo.isAuthorityManager && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin) {
        // Get user profile for email/name
        let userName = adminInfo.adminName;
        let userEmail: string | undefined;
        
        try {
          const { getUserFromFirestore } = await import('@/lib/firestore.service');
          const userProfile = await getUserFromFirestore(adminInfo.adminId);
          userName = userProfile?.core?.name || adminInfo.adminName;
          userEmail = userProfile?.core?.email;
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }

        // Create edit request instead of direct update
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

        // Return early - no direct update for authority managers
        return;
      }
    }

    // For super_admin/system_admin: update directly
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    let details = 'Updated park';
    
    // Safely assign all fields — NEVER allow undefined to reach Firestore
    if (data.name !== undefined) updateData.name = data.name ?? '';
    if (data.city !== undefined) updateData.city = data.city ?? '';
    if (data.description !== undefined) updateData.description = data.description ?? '';
    if (data.location !== undefined) updateData.location = data.location;
    if (data.image !== undefined) updateData.image = data.image ?? null;
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
    if (data.status !== undefined) {
      updateData.status = data.status;
      const oldStatus = park?.status || 'unknown';
      details = `Status changed from "${oldStatus}" to "${data.status}"`;
    }
    
    await updateDoc(docRef, updateData);
    
    // Log audit action (especially for status changes)
    if (adminInfo && (data.status !== undefined || Object.keys(updateData).length > 1)) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Park',
        targetId: parkId,
        details: `${details} - ${parkName}`,
      });
    }
  } catch (error) {
    console.error('Error updating park:', error);
    throw error;
  }
}

/**
 * Delete a park
 */
export async function deletePark(parkId: string): Promise<void> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting park:', error);
    throw error;
  }
}
