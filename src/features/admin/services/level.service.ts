/**
 * Firestore Service for Managing Levels
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
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Level } from '@/types/workout';

const LEVELS_COLLECTION = 'levels';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get all levels (sorted by order)
 */
export async function getAllLevels(): Promise<Level[]> {
  try {
    const q = query(collection(db, LEVELS_COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as Level));
  } catch (error) {
    console.error('Error fetching levels:', error);
    throw error;
  }
}

/**
 * Get a single level by ID
 */
export async function getLevel(levelId: string): Promise<Level | null> {
  try {
    const docRef = doc(db, LEVELS_COLLECTION, levelId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as Level;
  } catch (error) {
    console.error('Error fetching level:', error);
    throw error;
  }
}

/**
 * Create a new level
 */
export async function createLevel(data: Omit<Level, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, LEVELS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating level:', error);
    throw error;
  }
}

/**
 * Update a level
 */
export async function updateLevel(
  levelId: string, 
  data: Partial<Omit<Level, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, LEVELS_COLLECTION, levelId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating level:', error);
    throw error;
  }
}

/**
 * Delete a level
 */
export async function deleteLevel(levelId: string): Promise<void> {
  try {
    const docRef = doc(db, LEVELS_COLLECTION, levelId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting level:', error);
    throw error;
  }
}
