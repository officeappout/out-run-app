/**
 * Firestore Service for Managing Programs
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
import { Program } from './program.types';

const PROGRAMS_COLLECTION = 'programs';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Get all programs (sorted by name)
 */
export async function getAllPrograms(): Promise<Program[]> {
  try {
    const q = query(collection(db, PROGRAMS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as Program));
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  }
}

/**
 * Get a single program by ID
 */
export async function getProgram(programId: string): Promise<Program | null> {
  try {
    const docRef = doc(db, PROGRAMS_COLLECTION, programId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as Program;
  } catch (error) {
    console.error('Error fetching program:', error);
    throw error;
  }
}

/**
 * Create a new program
 */
export async function createProgram(data: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, PROGRAMS_COLLECTION), {
      ...data,
      isMaster: data.isMaster || false, // Default to false
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating program:', error);
    throw error;
  }
}

/**
 * Update a program
 */
export async function updateProgram(
  programId: string, 
  data: Partial<Omit<Program, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, PROGRAMS_COLLECTION, programId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating program:', error);
    throw error;
  }
}

/**
 * Delete a program
 */
export async function deleteProgram(programId: string): Promise<void> {
  try {
    const docRef = doc(db, PROGRAMS_COLLECTION, programId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting program:', error);
    throw error;
  }
}
