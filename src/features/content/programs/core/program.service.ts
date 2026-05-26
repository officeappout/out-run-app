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
 * Static slug → Firestore document ID map for master programs that have
 * Hebrew names and no `movementPattern` field — none of strategies 1–3 can
 * resolve them. These doc IDs are permanent (auto-generated, never change).
 *
 * Extend this map when new master programs are added to Firestore.
 */
export const MASTER_PROGRAM_SLUG_TO_ID: Record<string, string> = {
  full_body:          'H2279XsRGDg9G370J7S9',
  upper_body:         '47smw26hUyG5ZbE1bhr3',
  calisthenics_upper: 'JCac76p48XGZ5MVahLI2',
  muscle_up:          'fTLWzjP9gH2VNpamyCZF',
};

/**
 * Inverse of MASTER_PROGRAM_SLUG_TO_ID.
 * Used by the admin panel and other writers to convert a program's Firestore
 * doc ID back to its semantic slug before writing to `domains` / `tracks`.
 */
export const MASTER_PROGRAM_ID_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(MASTER_PROGRAM_SLUG_TO_ID).map(([slug, id]) => [id, slug]),
);

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
 *   1. Try getDoc(programs/{templateId}) — works when the doc ID is a semantic slug.
 *   2. Query where('movementPattern', '==', templateId) — finds programs created via the
 *      admin UI (which use auto-generated hash IDs). Covers 'push', 'pull', 'legs', 'core'.
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

  // ── Strategy 2: movementPattern field ─────────────────────────────────
  // Programs created via the admin UI use auto-generated Firestore IDs (hashes),
  // not semantic slugs as their doc ID. The 'movementPattern' field stores the
  // semantic value ('push', 'pull', 'legs', 'core') and is the correct field
  // to query when strategy 1 (direct doc ID lookup) fails.
  try {
    const q = query(
      collection(db, PROGRAMS_COLLECTION),
      where('movementPattern', '==', templateId),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt), updatedAt: toDate(d.data().updatedAt) } as Program;
    }
  } catch {
    // movementPattern query failed — continue
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

  // ── Strategy 4: static slug → hash for master programs ────────────────
  // Master programs (full_body, upper_body, calisthenics_upper) have Hebrew
  // names and no movementPattern — strategies 1–3 all fail for them.
  // This map provides a zero-read fast path for the known master slugs.
  const knownHash = MASTER_PROGRAM_SLUG_TO_ID[templateId];
  if (knownHash) {
    try {
      const byHash = await getProgram(knownHash);
      if (byHash) return byHash;
    } catch {
      // hash lookup failed — fall through
    }
  }

  // ── Strategy 5: canonical `slug` field ─────────────────────────────────
  // Skill programs (front_lever, planche, handstand, hspu, one_arm_pullup)
  // are created via the admin UI with auto-generated Firestore hash IDs.
  // The Program type includes an optional `slug` field (program.types.ts)
  // which, when set, is the canonical user-facing identifier. Strategies
  // 1–4 all miss these programs when the doc ID is a hash and movementPattern
  // stores a biomechanical category ('horizontal_pull') rather than the
  // skill slug.  This query directly matches the `slug` field, making
  // getProgramByTemplateId() a complete resolver for the full program taxonomy.
  try {
    const q = query(
      collection(db, PROGRAMS_COLLECTION),
      where('slug', '==', templateId),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return {
        id: d.id,
        ...d.data(),
        createdAt: toDate(d.data().createdAt),
        updatedAt: toDate(d.data().updatedAt),
      } as Program;
    }
  } catch {
    // slug field query failed — fall through
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
