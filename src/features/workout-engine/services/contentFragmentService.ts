/**
 * Content Fragment Service - Unified professional & creative content engine
 * Collections: 'workout_content_fragments', 'workout_funny_titles'
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

const CONTENT_FRAGMENTS_COLLECTION = 'workout_content_fragments';
const FUNNY_TITLES_COLLECTION = 'workout_funny_titles';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Content Fragment
 */
export interface ContentFragment {
  id: string;
  type: 'hook' | 'focus' | 'pro_insight' | 'punchline';
  text: string;
  metadata: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'any';
    difficulty?: 'easy' | 'medium' | 'hard' | 'any';
    workoutType?: 'strength' | 'volume' | 'endurance' | 'skills' | 'general' | 'any';
    targetMuscle?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Funny Title
 */
export interface FunnyTitle {
  id: string;
  text: string;
  intensity: 'light' | 'moderate' | 'hard';
  targetMuscle?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Fetch content fragments by type and filters
 */
export async function getContentFragments(
  type: ContentFragment['type'],
  filters?: {
    timeOfDay?: string;
    difficulty?: string;
    workoutType?: string;
    targetMuscle?: string;
  }
): Promise<ContentFragment[]> {
  try {
    let q = query(
      collection(db, CONTENT_FRAGMENTS_COLLECTION),
      where('type', '==', type)
    );

    const querySnapshot = await getDocs(q);
    
    let fragments = querySnapshot.docs.map(doc => ({
      id: doc.id,
      type: doc.data().type as ContentFragment['type'],
      text: doc.data().text || '',
      metadata: doc.data().metadata || {},
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));

    // Apply filters
    if (filters) {
      fragments = fragments.filter(fragment => {
        if (filters.timeOfDay && fragment.metadata.timeOfDay && fragment.metadata.timeOfDay !== 'any') {
          if (fragment.metadata.timeOfDay !== filters.timeOfDay) return false;
        }
        if (filters.difficulty && fragment.metadata.difficulty && fragment.metadata.difficulty !== 'any') {
          if (fragment.metadata.difficulty !== filters.difficulty) return false;
        }
        if (filters.workoutType && fragment.metadata.workoutType && fragment.metadata.workoutType !== 'any') {
          if (fragment.metadata.workoutType !== filters.workoutType) return false;
        }
        if (filters.targetMuscle && fragment.metadata.targetMuscle) {
          if (fragment.metadata.targetMuscle !== filters.targetMuscle) return false;
        }
        return true;
      });
    }

    // If no matches, try to get 'any' fallbacks
    if (fragments.length === 0) {
      const fallbackQuery = query(
        collection(db, CONTENT_FRAGMENTS_COLLECTION),
        where('type', '==', type)
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      fragments = fallbackSnapshot.docs
        .map(doc => ({
          id: doc.id,
          type: doc.data().type as ContentFragment['type'],
          text: doc.data().text || '',
          metadata: doc.data().metadata || {},
          createdAt: toDate(doc.data().createdAt),
          updatedAt: toDate(doc.data().updatedAt),
        }))
        .filter(f => {
          const meta = f.metadata;
          return (
            (!meta.timeOfDay || meta.timeOfDay === 'any') &&
            (!meta.difficulty || meta.difficulty === 'any') &&
            (!meta.workoutType || meta.workoutType === 'any')
          );
        });
    }

    return fragments;
  } catch (error) {
    console.error('[Content Fragment Service] Error fetching fragments:', error);
    return [];
  }
}

/**
 * Fetch funny titles by intensity
 */
export async function getFunnyTitles(
  intensity?: 'light' | 'moderate' | 'hard',
  targetMuscle?: string
): Promise<FunnyTitle[]> {
  try {
    let q = query(collection(db, FUNNY_TITLES_COLLECTION));

    if (intensity) {
      q = query(
        collection(db, FUNNY_TITLES_COLLECTION),
        where('intensity', '==', intensity)
      );
    }

    const querySnapshot = await getDocs(q);
    
    let titles = querySnapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text || '',
      intensity: doc.data().intensity || 'moderate',
      targetMuscle: doc.data().targetMuscle,
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));

    // Filter by target muscle if provided
    if (targetMuscle) {
      titles = titles.filter(t => !t.targetMuscle || t.targetMuscle === targetMuscle);
    }

    return titles;
  } catch (error) {
    console.error('[Content Fragment Service] Error fetching funny titles:', error);
    return [];
  }
}

/**
 * CRUD Operations for Content Fragments
 */
export const ContentFragmentService = {
  async create(data: Omit<ContentFragment, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, CONTENT_FRAGMENTS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<ContentFragment, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, CONTENT_FRAGMENTS_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, CONTENT_FRAGMENTS_COLLECTION, id));
  },
};

/**
 * CRUD Operations for Funny Titles
 */
export const FunnyTitleService = {
  async create(data: Omit<FunnyTitle, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, FUNNY_TITLES_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<FunnyTitle, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, FUNNY_TITLES_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, FUNNY_TITLES_COLLECTION, id));
  },
};
