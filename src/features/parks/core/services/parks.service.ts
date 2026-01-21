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
    if (data.facilities !== undefined) updateData.facilities = Array.isArray(data.facilities) ? data.facilities : [];
    if (data.gymEquipment !== undefined) {
      updateData.gymEquipment = Array.isArray(data.gymEquipment) && data.gymEquipment.length > 0 
        ? data.gymEquipment 
        : null;
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