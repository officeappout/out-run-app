/**
 * Firestore Service for Managing Personas
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
import { Persona, PersonaFormData } from './persona.types';
import { LocalizedText } from '../../shared/localized-text.types';

const PERSONAS_COLLECTION = 'personas';

// ============================================================================
// DEFAULT PERSONAS - Fallback when Firestore is empty
// ============================================================================

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'athlete',
    name: { he: 'הלמור הספורטיבי', en: 'Athletic Lemur', es: 'Lémur Atlético' },
    description: { 
      he: 'מושלם לספורטאים ואנשים פעילים שרוצים לשפר ביצועים ולהגיע לשיאים חדשים', 
      en: 'Perfect for athletes who want to improve performance and reach new personal records',
      es: 'Perfecto para atletas que quieren mejorar el rendimiento'
    },
    imageUrl: '/assets/lemur/smart-lemur.png',
    linkedLifestyleTags: ['athlete', 'active'],
    themeColor: '#06B6D4', // Cyan
  },
  {
    id: 'parent',
    name: { he: 'הלמור ההורי', en: 'Parent Lemur', es: 'Lémur Padre' },
    description: { 
      he: 'מותאם להורים עסוקים שמחפשים אימונים קצרים ויעילים בין המשימות', 
      en: 'Designed for busy parents looking for short, effective workouts between tasks',
      es: 'Diseñado para padres ocupados buscando entrenamientos cortos'
    },
    imageUrl: '/assets/lemur/lemur-avatar.png',
    linkedLifestyleTags: ['parent', 'busy'],
    themeColor: '#EC4899', // Pink
  },
  {
    id: 'office_worker',
    name: { he: 'הלמור המשרדי', en: 'Office Lemur', es: 'Lémur de Oficina' },
    description: { 
      he: 'אידיאלי לעובדי משרד שרוצים לשבור את הישיבה הממושכת ולשמור על כושר', 
      en: 'Ideal for office workers who want to break up sitting and stay fit',
      es: 'Ideal para trabajadores de oficina'
    },
    imageUrl: '/assets/lemur/king-lemur.png',
    linkedLifestyleTags: ['office_worker', 'wfh', 'remote_worker'],
    themeColor: '#3B82F6', // Blue
  },
  {
    id: 'student',
    name: { he: 'הלמור הסטודנט', en: 'Student Lemur', es: 'Lémur Estudiante' },
    description: { 
      he: 'מושלם לסטודנטים שמחפשים אימונים מהירים בין השיעורים והמבחנים', 
      en: 'Perfect for students looking for quick workouts between classes and exams',
      es: 'Perfecto para estudiantes'
    },
    imageUrl: '/assets/lemur/smart-lemur.png',
    linkedLifestyleTags: ['student', 'young'],
    themeColor: '#8B5CF6', // Purple
  },
  {
    id: 'senior',
    name: { he: 'הלמור הזהוב', en: 'Golden Lemur', es: 'Lémur Dorado' },
    description: { 
      he: 'תוכנית מותאמת לגיל הזהב עם דגש על תנועתיות, איזון ובריאות כללית', 
      en: 'A program tailored for seniors focusing on mobility, balance and general health',
      es: 'Un programa adaptado para personas mayores'
    },
    imageUrl: '/assets/lemur/lemur-avatar.png',
    linkedLifestyleTags: ['senior', 'health_focused'],
    themeColor: '#F59E0B', // Amber
  },
];

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Sanitize localized text object
 */
function sanitizeLocalizedText(text: LocalizedText | undefined): LocalizedText {
  if (!text) {
    return { he: '', en: '', es: '' };
  }
  return {
    he: text.he ?? '',
    en: text.en ?? '',
    es: text.es ?? '',
  };
}

/**
 * Get all personas (sorted by name)
 * Falls back to default personas if Firestore is empty or fails
 */
export async function getAllPersonas(): Promise<Persona[]> {
  try {
    const q = query(collection(db, PERSONAS_COLLECTION), orderBy('name.he', 'asc'));
    const snapshot = await getDocs(q);

    const personas = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as Persona));

    // If Firestore is empty, return default personas
    if (personas.length === 0) {
      console.log('[PersonaService] Firestore empty, returning default personas');
      return DEFAULT_PERSONAS;
    }

    return personas;
  } catch (error) {
    console.error('Error fetching personas from Firestore:', error);
    // Return default personas on error
    console.log('[PersonaService] Error occurred, returning default personas');
    return DEFAULT_PERSONAS;
  }
}

/**
 * Get default personas (for testing/fallback)
 */
export function getDefaultPersonas(): Persona[] {
  return DEFAULT_PERSONAS;
}

/**
 * Get a single persona by ID
 */
export async function getPersona(personaId: string): Promise<Persona | null> {
  try {
    const docRef = doc(db, PERSONAS_COLLECTION, personaId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: toDate(docSnap.data().createdAt),
      updatedAt: toDate(docSnap.data().updatedAt),
    } as Persona;
  } catch (error) {
    console.error('Error fetching persona:', error);
    throw error;
  }
}

/**
 * Create a new persona
 */
export async function createPersona(
  data: PersonaFormData,
  adminInfo?: { adminId: string; adminName: string }
): Promise<string> {
  try {
    const personaData: any = {
      name: sanitizeLocalizedText(data.name),
      description: sanitizeLocalizedText(data.description),
      imageUrl: data.imageUrl || '',
      linkedLifestyleTags: Array.isArray(data.linkedLifestyleTags) ? data.linkedLifestyleTags : [],
      themeColor: data.themeColor || '#3B82F6',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, PERSONAS_COLLECTION), personaData);

    // Log admin action if provided
    if (adminInfo) {
      const { logAction } = await import('@/features/admin/services/audit.service');
      await logAction(adminInfo.adminId, adminInfo.adminName, 'create', 'persona', docRef.id, {
        name: data.name,
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('Error creating persona:', error);
    throw error;
  }
}

/**
 * Update an existing persona
 */
export async function updatePersona(
  personaId: string,
  data: Partial<PersonaFormData>,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, PERSONAS_COLLECTION, personaId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (data.name !== undefined) {
      updateData.name = sanitizeLocalizedText(data.name);
    }
    if (data.description !== undefined) {
      updateData.description = sanitizeLocalizedText(data.description);
    }
    if (data.imageUrl !== undefined) {
      updateData.imageUrl = data.imageUrl;
    }
    if (data.linkedLifestyleTags !== undefined) {
      updateData.linkedLifestyleTags = Array.isArray(data.linkedLifestyleTags) ? data.linkedLifestyleTags : [];
    }
    if (data.themeColor !== undefined) {
      updateData.themeColor = data.themeColor;
    }

    await updateDoc(docRef, updateData);

    // Log admin action if provided
    if (adminInfo) {
      const { logAction } = await import('@/features/admin/services/audit.service');
      await logAction(adminInfo.adminId, adminInfo.adminName, 'update', 'persona', personaId, updateData);
    }
  } catch (error) {
    console.error('Error updating persona:', error);
    throw error;
  }
}

/**
 * Delete a persona
 */
export async function deletePersona(
  personaId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, PERSONAS_COLLECTION, personaId);
    await deleteDoc(docRef);

    // Log admin action if provided
    if (adminInfo) {
      const { logAction } = await import('@/features/admin/services/audit.service');
      await logAction(adminInfo.adminId, adminInfo.adminName, 'delete', 'persona', personaId);
    }
  } catch (error) {
    console.error('Error deleting persona:', error);
    throw error;
  }
}
