/**
 * Parks Service (Unified)
 * Handles CRUD operations and client fetching for parks
 * Merged from admin parks.service.ts and map parks.service.ts
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
import { Park, ParkStatus } from '../types/park.types';

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
    facilityType: data?.facilityType ?? undefined,
    sportTypes: Array.isArray(data?.sportTypes) ? data.sportTypes : undefined,
    featureTags: Array.isArray(data?.featureTags) ? data.featureTags : undefined,
    natureType: data?.natureType ?? undefined,
    communityType: data?.communityType ?? undefined,
    urbanType: data?.urbanType ?? undefined,
    stairsDetails: data?.stairsDetails ?? undefined,
    benchDetails: data?.benchDetails ?? undefined,
    parkingDetails: data?.parkingDetails ?? undefined,
    isDogFriendly: data?.isDogFriendly ?? false,
    courtType: data?.courtType ?? undefined,
    hasWaterFountain: data?.hasWaterFountain ?? false,
    terrainType: data?.terrainType ?? undefined,
    environment: data?.environment ?? undefined,
    externalSourceId: data?.externalSourceId ?? undefined,
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
      console.warn('[Parks Service] Firebase index not ready yet. Returning empty array.');
      return [];
    }
    console.error('Error fetching parks by authority:', error);
    return [];
  }
}

/**
 * Fetch real parks for map display (Client-side)
 * Simple fetch for displaying parks on the map
 */
export async function fetchRealParks(): Promise<Park[]> {
  try {
    const querySnapshot = await getDocs(collection(db, PARKS_COLLECTION));
    
    const parks = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        location: data.location,
        city: data.city,
        facilities: data.facilities || [],
        type: 'park',
        rating: 5
      } as Park;
    });
    
    return parks;
  } catch (error) {
    console.error('[Parks Service] Error fetching parks:', error);
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
export async function createPark(data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const parkData = {
      name: data.name ?? '',
      city: data.city ?? '',
      description: data.description ?? '',
      location: data.location ?? { lat: 0, lng: 0 },
      image: data.image ?? null,
      facilityType: data.facilityType ?? null,
      sportTypes: Array.isArray(data.sportTypes) ? data.sportTypes : [],
      featureTags: Array.isArray(data.featureTags) ? data.featureTags : [],
      natureType: data.natureType ?? null,
      communityType: data.communityType ?? null,
      urbanType: data.urbanType ?? null,
      stairsDetails: data.stairsDetails ?? null,
      benchDetails: data.benchDetails ?? null,
      parkingDetails: data.parkingDetails ?? null,
      isDogFriendly: data.isDogFriendly ?? false,
      courtType: data.courtType ?? null,
      hasWaterFountain: data.hasWaterFountain ?? false,
      terrainType: data.terrainType ?? null,
      environment: data.environment ?? null,
      externalSourceId: data.externalSourceId ?? null,
      facilities: Array.isArray(data.facilities) ? data.facilities : [],
      gymEquipment: Array.isArray(data.gymEquipment) ? data.gymEquipment : [],
      amenities: data.amenities ?? null,
      authorityId: data.authorityId ?? null,
      status: data.status ?? 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, PARKS_COLLECTION), parkData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating park:', error);
    throw error;
  }
}

/**
 * Update a park
 */
export async function updatePark(
  parkId: string,
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.image !== undefined) updateData.image = data.image ?? null;
    if (data.facilityType !== undefined) updateData.facilityType = data.facilityType ?? null;
    if (data.sportTypes !== undefined) {
      updateData.sportTypes = Array.isArray(data.sportTypes) ? data.sportTypes : [];
    }
    if (data.featureTags !== undefined) {
      updateData.featureTags = Array.isArray(data.featureTags) ? data.featureTags : [];
    }
    if (data.natureType !== undefined) updateData.natureType = data.natureType ?? null;
    if (data.communityType !== undefined) updateData.communityType = data.communityType ?? null;
    if (data.urbanType !== undefined) updateData.urbanType = data.urbanType ?? null;
    if (data.stairsDetails !== undefined) updateData.stairsDetails = data.stairsDetails ?? null;
    if (data.benchDetails !== undefined) updateData.benchDetails = data.benchDetails ?? null;
    if (data.parkingDetails !== undefined) updateData.parkingDetails = data.parkingDetails ?? null;
    if (data.isDogFriendly !== undefined) updateData.isDogFriendly = data.isDogFriendly ?? false;
    if (data.courtType !== undefined) updateData.courtType = data.courtType ?? null;
    if (data.hasWaterFountain !== undefined) updateData.hasWaterFountain = data.hasWaterFountain ?? false;
    if (data.terrainType !== undefined) updateData.terrainType = data.terrainType ?? null;
    if (data.environment !== undefined) updateData.environment = data.environment ?? null;
    if (data.externalSourceId !== undefined) updateData.externalSourceId = data.externalSourceId ?? null;
    if (data.facilities !== undefined) updateData.facilities = Array.isArray(data.facilities) ? data.facilities : [];
    if (data.gymEquipment !== undefined) {
      updateData.gymEquipment = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];
    }
    if (data.amenities !== undefined) updateData.amenities = data.amenities ?? null;
    if (data.authorityId !== undefined) updateData.authorityId = data.authorityId ?? null;
    if (data.status !== undefined) updateData.status = data.status;
    
    await updateDoc(docRef, updateData);
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