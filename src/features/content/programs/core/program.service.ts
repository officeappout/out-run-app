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
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Program } from './program.types';

const PROGRAMS_COLLECTION = 'programs';

/**
 * Strip undefined values from an object before writing to Firestore.
 * Firebase throws if any field value is `undefined`.
 */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

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
 * Resolve a program from a semantic templateId (e.g. 'full_body', 'calisthenics_upper').
 *
 * Strategy (in order):
 *   1. Try getDoc(programs/{templateId}) — works when admin used setDoc with a semantic ID.
 *   2. Query where('slug', '==', templateId) — works when admin saved a slug field.
 *   3. Query where('name', '==', humanized) — last resort: 'full_body' → 'full body'.
 *
 * Returns null only when all three strategies fail (program truly not in Firestore).
 */
export async function getProgramByTemplateId(templateId: string): Promise<Program | null> {
  if (!templateId) return null;

  // ── Strategy 1: semantic document ID ───────────────────────────────────
  try {
    const byId = await getProgram(templateId);
    if (byId) return byId;
  } catch {
    // not found or permission error — continue
  }

  // ── Strategy 2: slug field ──────────────────────────────────────────────
  try {
    const q = query(
      collection(db, PROGRAMS_COLLECTION),
      where('slug', '==', templateId),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt), updatedAt: toDate(d.data().updatedAt) } as Program;
    }
  } catch {
    // no slug field — continue
  }

  // ── Strategy 3: humanised name ──────────────────────────────────────────
  try {
    const humanName = templateId.replace(/_/g, ' ').toLowerCase();
    const allSnap = await getDocs(collection(db, PROGRAMS_COLLECTION));
    for (const d of allSnap.docs) {
      const name = String(d.data().name ?? '').toLowerCase();
      if (name === humanName || name.replace(/\s+/g, '_') === templateId.toLowerCase()) {
        return { id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt), updatedAt: toDate(d.data().updatedAt) } as Program;
      }
    }
  } catch {
    // collection read failed
  }

  console.warn(`[Programs] getProgramByTemplateId: no match for "${templateId}"`);
  return null;
}

/**
 * Create a new program
 */
export async function createProgram(data: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, PROGRAMS_COLLECTION), stripUndefined({
      ...data,
      isMaster: data.isMaster || false, // Default to false
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
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
    await updateDoc(docRef, stripUndefined({
      ...data,
      updatedAt: serverTimestamp(),
    }));
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
