/**
 * Firestore Service for Managing Gear Definitions
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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GearDefinition, GearDefinitionFormData } from '@/types/gear-definition.type';

const GEAR_DEFINITIONS_COLLECTION = 'gear_definitions';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get all gear definitions (sorted by name)
 */
export async function getAllGearDefinitions(): Promise<GearDefinition[]> {
  try {
    const q = query(collection(db, GEAR_DEFINITIONS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as GearDefinition));
  } catch (error) {
    console.error('Error fetching gear definitions:', error);
    throw error;
  }
}

/**
 * Get a single gear definition by ID
 */
export async function getGearDefinition(gearId: string): Promise<GearDefinition | null> {
  try {
    const docRef = doc(db, GEAR_DEFINITIONS_COLLECTION, gearId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as GearDefinition;
  } catch (error) {
    console.error('Error fetching gear definition:', error);
    throw error;
  }
}

/**
 * Create a new gear definition
 */
export async function createGearDefinition(
  data: GearDefinitionFormData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, GEAR_DEFINITIONS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating gear definition:', error);
    throw error;
  }
}

/**
 * Update a gear definition
 */
export async function updateGearDefinition(
  gearId: string,
  data: Partial<GearDefinitionFormData>
): Promise<void> {
  try {
    const docRef = doc(db, GEAR_DEFINITIONS_COLLECTION, gearId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating gear definition:', error);
    throw error;
  }
}

/**
 * Delete a gear definition
 */
export async function deleteGearDefinition(gearId: string): Promise<void> {
  try {
    const docRef = doc(db, GEAR_DEFINITIONS_COLLECTION, gearId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting gear definition:', error);
    throw error;
  }
}

/**
 * Search gear definitions by name
 */
export async function searchGearDefinitions(searchTerm: string): Promise<GearDefinition[]> {
  try {
    const allGear = await getAllGearDefinitions();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return allGear.filter(
      (gear) =>
        gear.name?.he.toLowerCase().includes(lowerSearchTerm) ||
        gear.name?.en.toLowerCase().includes(lowerSearchTerm) ||
        gear.description?.he?.toLowerCase().includes(lowerSearchTerm) ||
        gear.description?.en?.toLowerCase().includes(lowerSearchTerm) ||
        gear.category?.toLowerCase().includes(lowerSearchTerm)
    );
  } catch (error) {
    console.error('Error searching gear definitions:', error);
    throw error;
  }
}

/**
 * Duplicate a gear definition
 */
export async function duplicateGearDefinition(gearId: string): Promise<string> {
  try {
    const originalGear = await getGearDefinition(gearId);
    if (!originalGear) {
      throw new Error('Gear definition not found');
    }

    const duplicateData: GearDefinitionFormData = {
      name: {
        he: `עותק של ${originalGear.name?.he || originalGear.name?.en || ''}`,
        en: `Copy of ${originalGear.name?.en || originalGear.name?.he || ''}`,
      },
      description: originalGear.description
        ? {
            he: originalGear.description.he || originalGear.description.en || '',
            en: originalGear.description.en || originalGear.description.he || '',
          }
        : undefined,
      icon: originalGear.icon,
      category: originalGear.category,
      shopLink: originalGear.shopLink,
      tutorialVideo: originalGear.tutorialVideo,
      customIconUrl: originalGear.customIconUrl,
    };

    return await createGearDefinition(duplicateData);
  } catch (error) {
    console.error('Error duplicating gear definition:', error);
    throw error;
  }
}

/**
 * Initialize default gear definitions
 */
export async function initializeDefaultGearDefinitions(): Promise<void> {
  const defaultGear: GearDefinitionFormData[] = [
    {
      name: { he: 'גומיות', en: 'Resistance Bands' },
      description: { he: 'גומיות התנגדות', en: 'Resistance bands' },
      icon: 'Dumbbell',
      category: 'resistance',
    },
    {
      name: { he: 'משקולות', en: 'Dumbbells' },
      description: { he: 'משקולות יד', en: 'Hand dumbbells' },
      icon: 'Dumbbell',
      category: 'weights',
    },
    {
      name: { he: 'קיטלבל', en: 'Kettlebell' },
      description: { he: 'קיטלבל', en: 'Kettlebell' },
      icon: 'Circle',
      category: 'weights',
    },
    {
      name: { he: 'חבל קפיצה', en: 'Jump Rope' },
      description: { he: 'חבל קפיצה לאימון', en: 'Jump rope for training' },
      icon: 'Activity',
      category: 'accessories',
    },
    {
      name: { he: 'מזרן', en: 'Mat' },
      description: { he: 'מזרן יוגה/אימון', en: 'Yoga/training mat' },
      icon: 'Square',
      category: 'accessories',
    },
    {
      name: { he: 'טבעות', en: 'Rings' },
      description: { he: 'טבעות התעמלות', en: 'Gymnastic rings' },
      icon: 'Circle',
      category: 'suspension',
    },
    {
      name: { he: 'TRX', en: 'TRX' },
      description: { he: 'רצועות TRX', en: 'TRX Suspension Trainer' },
      icon: 'Anchor',
      category: 'suspension',
    },
  ];

  try {
    const existingGear = await getAllGearDefinitions();
    const existingNames = new Set(existingGear.map((g) => g.name?.he || g.name?.en || ''));

    for (const gear of defaultGear) {
      const defaultNameHe = gear.name.he;
      if (!existingNames.has(defaultNameHe)) {
        await createGearDefinition(gear);
        console.log(`Created default gear: ${gear.name}`);
      }
    }
  } catch (error) {
    console.error('Error initializing default gear definitions:', error);
    throw error;
  }
}
