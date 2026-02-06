/**
 * Message Service - Fetches dynamic message templates from Firebase
 * Collections: 'workout_titles_creative', 'workout_time_contexts', 'workout_focus_fragments'
 */
import {
  collection,
  getDocs,
  doc,
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

const TITLES_CREATIVE_COLLECTION = 'workout_titles_creative';
const TIME_CONTEXTS_COLLECTION = 'workout_time_contexts';
const FOCUS_FRAGMENTS_COLLECTION = 'workout_focus_fragments';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Creative Workout Title
 */
export interface CreativeTitle {
  id: string;
  text: string;
  category: 'hard' | 'easy' | 'any';
  tags: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Time Context for Workouts
 */
export interface WorkoutTimeContext {
  id: string;
  timeRange: string; // e.g., "morning", "evening", "afternoon"
  greetings: string[]; // Array of greeting strings
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Focus Fragment for Workouts
 */
export interface FocusFragment {
  id: string;
  focus: string; // e.g., 'abs', 'upper_body', 'lower_body'
  phrases: string[]; // Array of phrase strings
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Fetch all creative titles
 */
export async function getCreativeTitles(category?: 'hard' | 'easy' | 'any'): Promise<CreativeTitle[]> {
  try {
    let q;
    
    if (category && category !== 'any') {
      // Firestore 'in' operator supports up to 10 values
      q = query(
        collection(db, TITLES_CREATIVE_COLLECTION),
        where('category', 'in', [category, 'any'])
      );
    } else {
      q = query(collection(db, TITLES_CREATIVE_COLLECTION));
    }
    
    const querySnapshot = await getDocs(q);
    
    const titles = querySnapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text || '',
      category: doc.data().category || 'any',
      tags: doc.data().tags || [],
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));
    
    // Sort by text alphabetically
    return titles.sort((a, b) => a.text.localeCompare(b.text));
  } catch (error) {
    console.error('[Message Service] Error fetching creative titles:', error);
    return [];
  }
}

/**
 * Fetch all time contexts
 */
export async function getWorkoutTimeContexts(): Promise<WorkoutTimeContext[]> {
  try {
    const q = query(collection(db, TIME_CONTEXTS_COLLECTION), orderBy('timeRange', 'asc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      timeRange: doc.data().timeRange || '',
      greetings: doc.data().greetings || [],
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));
  } catch (error) {
    console.error('[Message Service] Error fetching time contexts:', error);
    return [];
  }
}

/**
 * Get time context by time range
 */
export async function getTimeContextByRange(timeRange: string): Promise<WorkoutTimeContext | null> {
  try {
    const q = query(
      collection(db, TIME_CONTEXTS_COLLECTION),
      where('timeRange', '==', timeRange)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return null;
    
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      timeRange: doc.data().timeRange || '',
      greetings: doc.data().greetings || [],
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    };
  } catch (error) {
    console.error('[Message Service] Error fetching time context by range:', error);
    return null;
  }
}

/**
 * Fetch all focus fragments
 */
export async function getFocusFragments(focus?: string): Promise<FocusFragment[]> {
  try {
    let q = query(collection(db, FOCUS_FRAGMENTS_COLLECTION), orderBy('focus', 'asc'));
    
    if (focus) {
      q = query(
        collection(db, FOCUS_FRAGMENTS_COLLECTION),
        where('focus', '==', focus),
        orderBy('focus', 'asc')
      );
    }
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      focus: doc.data().focus || '',
      phrases: doc.data().phrases || [],
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));
  } catch (error) {
    console.error('[Message Service] Error fetching focus fragments:', error);
    return [];
  }
}

/**
 * CRUD Operations for Creative Titles
 */
export const CreativeTitleService = {
  async create(data: Omit<CreativeTitle, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, TITLES_CREATIVE_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<CreativeTitle, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, TITLES_CREATIVE_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, TITLES_CREATIVE_COLLECTION, id));
  },
};

/**
 * CRUD Operations for Time Contexts
 */
export const WorkoutTimeContextService = {
  async create(data: Omit<WorkoutTimeContext, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, TIME_CONTEXTS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<WorkoutTimeContext, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, TIME_CONTEXTS_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, TIME_CONTEXTS_COLLECTION, id));
  },
};

/**
 * CRUD Operations for Focus Fragments
 */
export const FocusFragmentService = {
  async create(data: Omit<FocusFragment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, FOCUS_FRAGMENTS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<FocusFragment, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, FOCUS_FRAGMENTS_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, FOCUS_FRAGMENTS_COLLECTION, id));
  },
};
