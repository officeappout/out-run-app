/**
 * Firestore Service for Managing Outdoor Equipment Brands
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
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { OutdoorBrand, OutdoorBrandFormData } from './outdoor-brand.types';

const OUTDOOR_BRANDS_COLLECTION = 'outdoorBrands';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get all outdoor brands (sorted by name)
 */
export async function getAllOutdoorBrands(): Promise<OutdoorBrand[]> {
  try {
    const q = query(collection(db, OUTDOOR_BRANDS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as OutdoorBrand));
  } catch (error) {
    console.error('Error fetching outdoor brands:', error);
    throw error;
  }
}

/**
 * Get a single outdoor brand by ID
 */
export async function getOutdoorBrand(brandId: string): Promise<OutdoorBrand | null> {
  try {
    const docRef = doc(db, OUTDOOR_BRANDS_COLLECTION, brandId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as OutdoorBrand;
  } catch (error) {
    console.error('Error fetching outdoor brand:', error);
    throw error;
  }
}

/**
 * Create a new outdoor brand
 */
export async function createOutdoorBrand(data: OutdoorBrandFormData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, OUTDOOR_BRANDS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating outdoor brand:', error);
    throw error;
  }
}

/**
 * Update an existing outdoor brand
 */
export async function updateOutdoorBrand(
  brandId: string,
  data: Partial<OutdoorBrandFormData>
): Promise<void> {
  try {
    const docRef = doc(db, OUTDOOR_BRANDS_COLLECTION, brandId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating outdoor brand:', error);
    throw error;
  }
}

/**
 * Delete an outdoor brand
 */
export async function deleteOutdoorBrand(brandId: string): Promise<void> {
  try {
    const docRef = doc(db, OUTDOOR_BRANDS_COLLECTION, brandId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting outdoor brand:', error);
    throw error;
  }
}

/**
 * Search outdoor brands by name
 */
export async function searchOutdoorBrands(searchTerm: string): Promise<OutdoorBrand[]> {
  try {
    const allBrands = await getAllOutdoorBrands();
    const lowerSearch = searchTerm.toLowerCase();
    
    return allBrands.filter(
      (brand) =>
        brand.name.toLowerCase().includes(lowerSearch) ||
        brand.description?.toLowerCase().includes(lowerSearch)
    );
  } catch (error) {
    console.error('Error searching outdoor brands:', error);
    throw error;
  }
}

/**
 * Seed the "Generic Urban" brand
 */
export async function seedGenericUrbanBrand(): Promise<string | null> {
  try {
    // Check if it already exists
    const allBrands = await getAllOutdoorBrands();
    const existing = allBrands.find((b) => b.name === 'Generic Urban' || b.name === 'ריהוט רחוב גנרי');
    
    if (existing) {
      return existing.id;
    }

    // Create the brand
    return await createOutdoorBrand({
      name: 'Generic Urban',
      description: 'ריהוט רחוב גנרי - ספסלים, קירות, מדרגות וציוד עירוני אחר',
      brandColor: '#6B7280', // Gray color for generic
    });
  } catch (error) {
    console.error('Error seeding Generic Urban brand:', error);
    return null;
  }
}
