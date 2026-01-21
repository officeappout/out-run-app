/**
 * Firestore Service for Managing Gym Equipment
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
import { GymEquipment, GymEquipmentFormData } from '@/types/gym-equipment.type';
import { ExerciseType } from '@/types/exercise.type';

const GYM_EQUIPMENT_COLLECTION = 'gym_equipment';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get all gym equipment (sorted by name)
 */
export async function getAllGymEquipment(): Promise<GymEquipment[]> {
  try {
    const q = query(collection(db, GYM_EQUIPMENT_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as GymEquipment));
  } catch (error) {
    console.error('Error fetching gym equipment:', error);
    throw error;
  }
}

/**
 * Get gym equipment by type
 */
export async function getGymEquipmentByType(type: ExerciseType): Promise<GymEquipment[]> {
  try {
    const q = query(
      collection(db, GYM_EQUIPMENT_COLLECTION),
      where('type', '==', type),
      orderBy('name', 'asc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as GymEquipment));
  } catch (error) {
    console.error('Error fetching gym equipment by type:', error);
    throw error;
  }
}

/**
 * Get a single gym equipment by ID
 */
export async function getGymEquipment(equipmentId: string): Promise<GymEquipment | null> {
  try {
    const docRef = doc(db, GYM_EQUIPMENT_COLLECTION, equipmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as GymEquipment;
  } catch (error) {
    console.error('Error fetching gym equipment:', error);
    throw error;
  }
}

/**
 * Search gym equipment by name
 */
export async function searchGymEquipment(searchTerm: string): Promise<GymEquipment[]> {
  try {
    const allEquipment = await getAllGymEquipment();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return allEquipment.filter((equipment) =>
      equipment.name.toLowerCase().includes(lowerSearchTerm)
    );
  } catch (error) {
    console.error('Error searching gym equipment:', error);
    throw error;
  }
}

/**
 * Create a new gym equipment
 */
export async function createGymEquipment(
  data: GymEquipmentFormData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, GYM_EQUIPMENT_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating gym equipment:', error);
    throw error;
  }
}

/**
 * Update gym equipment
 */
export async function updateGymEquipment(
  equipmentId: string,
  data: Partial<GymEquipmentFormData>
): Promise<void> {
  try {
    const docRef = doc(db, GYM_EQUIPMENT_COLLECTION, equipmentId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating gym equipment:', error);
    throw error;
  }
}

/**
 * Delete gym equipment
 */
export async function deleteGymEquipment(equipmentId: string): Promise<void> {
  try {
    const docRef = doc(db, GYM_EQUIPMENT_COLLECTION, equipmentId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting gym equipment:', error);
    throw error;
  }
}

/**
 * Duplicate gym equipment (create a copy with "Copy of" prefix)
 */
export async function duplicateGymEquipment(equipmentId: string): Promise<string> {
  try {
    const originalEquipment = await getGymEquipment(equipmentId);
    if (!originalEquipment) {
      throw new Error('Gym equipment not found');
    }

    const duplicateData: GymEquipmentFormData = {
      name: `Copy of ${originalEquipment.name}`,
      type: originalEquipment.type,
      recommendedLevel: originalEquipment.recommendedLevel,
      isFunctional: originalEquipment.isFunctional,
      muscleGroups: [...originalEquipment.muscleGroups],
      brands: originalEquipment.brands.map((brand) => ({
        ...brand,
      })),
    };

    return await createGymEquipment(duplicateData);
  } catch (error) {
    console.error('Error duplicating gym equipment:', error);
    throw error;
  }
}

/**
 * Initialize default gym equipment (including Street Bench)
 * This should be called once to set up the equipment catalog
 */
export async function initializeDefaultGymEquipment(): Promise<void> {
  const defaultEquipment: GymEquipmentFormData[] = [
    {
      name: 'ספסל רחוב',
      type: 'reps',
      recommendedLevel: 1,
      isFunctional: true,
      muscleGroups: ['chest', 'triceps', 'shoulders', 'core'],
      brands: [
        {
          brandName: 'Default',
          imageUrl: '',
          videoUrl: '',
        },
      ],
    },
  ];

  try {
    const existingEquipment = await getAllGymEquipment();
    const existingNames = new Set(existingEquipment.map((e) => e.name));

    for (const equipment of defaultEquipment) {
      if (!existingNames.has(equipment.name)) {
        await createGymEquipment(equipment);
        console.log(`Created default gym equipment: ${equipment.name}`);
      }
    }
  } catch (error) {
    console.error('Error initializing default gym equipment:', error);
    throw error;
  }
}
