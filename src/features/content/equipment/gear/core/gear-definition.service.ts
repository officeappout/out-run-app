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
import { GearDefinition, GearDefinitionFormData } from './gear-definition.types';
import { registerGearAlias } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

const GEAR_DEFINITIONS_COLLECTION = 'gear_definitions';

/**
 * Convert Firestore timestamp, Unix epoch, or date string to Date.
 */
function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}

/**
 * Sanitize gear definition data for Firestore
 * Removes undefined values (Firebase doesn't accept them) and provides defaults
 */
function sanitizeGearData(data: GearDefinitionFormData | Partial<GearDefinitionFormData>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  // Copy all defined values, converting undefined to null or providing defaults
  if (data.name !== undefined) {
    sanitized.name = {
      he: data.name.he || '',
      en: data.name.en || '',
    };
  }
  
  if (data.description !== undefined) {
    sanitized.description = {
      he: data.description?.he || '',
      en: data.description?.en || '',
    };
  }
  
  // Simple string fields - use null if undefined
  if (data.icon !== undefined) sanitized.icon = data.icon;
  if (data.customIconUrl !== undefined) sanitized.customIconUrl = data.customIconUrl || null;
  if (data.iconKey !== undefined) sanitized.iconKey = data.iconKey || null;
  if (data.category !== undefined) sanitized.category = data.category || null;
  if (data.shopLink !== undefined) sanitized.shopLink = data.shopLink || null;
  if (data.tutorialVideo !== undefined) sanitized.tutorialVideo = data.tutorialVideo || null;
  
  // Location fields - provide sensible defaults
  if (data.defaultLocation !== undefined) {
    sanitized.defaultLocation = data.defaultLocation || 'home';
  }
  if (data.allowedLocations !== undefined) {
    sanitized.allowedLocations = Array.isArray(data.allowedLocations) ? data.allowedLocations : [];
  }
  if (data.lifestyleTags !== undefined) {
    sanitized.lifestyleTags = Array.isArray(data.lifestyleTags) ? data.lifestyleTags : [];
  }
  if (data.isOptional !== undefined) {
    sanitized.isOptional = data.isOptional === true;
  }
  
  return sanitized;
}

/**
 * Sanitize gear definition data for CREATE operation
 * Ensures all required fields have values
 */
function sanitizeGearDataForCreate(data: GearDefinitionFormData): Record<string, any> {
  return {
    name: {
      he: data.name?.he || '',
      en: data.name?.en || '',
    },
    description: data.description ? {
      he: data.description.he || '',
      en: data.description.en || '',
    } : null,
    icon: data.icon || 'Package',
    customIconUrl: data.customIconUrl || null,
    iconKey: data.iconKey || null,
    category: data.category || 'accessories',
    shopLink: data.shopLink || null,
    tutorialVideo: data.tutorialVideo || null,
    defaultLocation: data.defaultLocation || 'home',
    allowedLocations: Array.isArray(data.allowedLocations) ? data.allowedLocations : [],
    lifestyleTags: Array.isArray(data.lifestyleTags) ? data.lifestyleTags : [],
    isOptional: data.isOptional === true,
  };
}

/**
 * Get all gear definitions (sorted by name)
 */
export async function getAllGearDefinitions(): Promise<GearDefinition[]> {
  try {
    const q = query(collection(db, GEAR_DEFINITIONS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    const defs: GearDefinition[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as GearDefinition));

    // Register ALL items — items with iconKey get a direct canonical mapping;
    // items without iconKey use their Hebrew name to resolve via LABEL_TO_ICON_KEY.
    for (const def of defs) {
      registerGearAlias(def.id, def.iconKey, def.category, def.name?.he);
    }

    return defs;
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
    // Sanitize data to remove undefined values (Firebase doesn't accept them)
    const sanitizedData = sanitizeGearDataForCreate(data);
    
    const docRef = await addDoc(collection(db, GEAR_DEFINITIONS_COLLECTION), {
      ...sanitizedData,
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
    // Sanitize data to remove undefined values (Firebase doesn't accept them)
    const sanitizedData = sanitizeGearData(data);
    
    const docRef = doc(db, GEAR_DEFINITIONS_COLLECTION, gearId);
    await updateDoc(docRef, {
      ...sanitizedData,
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
      isOptional: false,
    },
    {
      name: { he: 'משקולות', en: 'Dumbbells' },
      description: { he: 'משקולות יד', en: 'Hand dumbbells' },
      icon: 'Dumbbell',
      category: 'weights',
      isOptional: false,
    },
    {
      name: { he: 'קיטלבל', en: 'Kettlebell' },
      description: { he: 'קיטלבל', en: 'Kettlebell' },
      icon: 'Circle',
      category: 'weights',
      isOptional: false,
    },
    {
      name: { he: 'חבל קפיצה', en: 'Jump Rope' },
      description: { he: 'חבל קפיצה לאימון', en: 'Jump rope for training' },
      icon: 'Activity',
      category: 'accessories',
      isOptional: true,
    },
    {
      name: { he: 'מזרן', en: 'Mat' },
      description: { he: 'מזרן יוגה/אימון', en: 'Yoga/training mat' },
      icon: 'Square',
      category: 'accessories',
      isOptional: true,
    },
    {
      name: { he: 'טבעות', en: 'Rings' },
      description: { he: 'טבעות התעמלות', en: 'Gymnastic rings' },
      icon: 'Circle',
      category: 'suspension',
      isOptional: false,
    },
    {
      name: { he: 'TRX', en: 'TRX' },
      description: { he: 'רצועות TRX', en: 'TRX Suspension Trainer' },
      icon: 'Anchor',
      category: 'suspension',
      isOptional: false,
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
