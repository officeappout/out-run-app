/**
 * Content Service - Fetches dynamic content templates from Firebase
 * Collections: 'time_contexts' and 'focus_descriptions'
 */
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const TIME_CONTEXTS_COLLECTION = 'time_contexts';
const FOCUS_DESCRIPTIONS_COLLECTION = 'focus_descriptions';

/**
 * Time Context - Greeting based on time of day
 */
export interface TimeContext {
  id: string;
  hourStart: number; // 0-23
  hourEnd: number; // 0-23
  greeting: string; // e.g., "בוקר טוב", "צהריים טובים", "ערב טוב"
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Focus Description - Description phrase based on workout focus
 */
export interface FocusDescription {
  id: string;
  focus: string; // e.g., 'abs', 'upper_body', 'lower_body', 'cardio', 'recovery'
  phrase: string; // e.g., "ממוקד בטן", "לחיזוק פלג גוף עליון"
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Fetch all time contexts from Firebase
 */
export async function getTimeContexts(): Promise<TimeContext[]> {
  try {
    const q = query(collection(db, TIME_CONTEXTS_COLLECTION), orderBy('hourStart', 'asc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      hourStart: doc.data().hourStart || 0,
      hourEnd: doc.data().hourEnd || 23,
      greeting: doc.data().greeting || '',
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));
  } catch (error) {
    console.error('[Content Service] Error fetching time contexts:', error);
    return [];
  }
}

/**
 * Fetch all focus descriptions from Firebase
 */
export async function getFocusDescriptions(): Promise<FocusDescription[]> {
  try {
    const q = query(collection(db, FOCUS_DESCRIPTIONS_COLLECTION), orderBy('focus', 'asc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      focus: doc.data().focus || '',
      phrase: doc.data().phrase || '',
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    }));
  } catch (error) {
    console.error('[Content Service] Error fetching focus descriptions:', error);
    return [];
  }
}

/**
 * Get greeting based on current hour
 */
function getGreetingForHour(hour: number, timeContexts: TimeContext[]): string {
  // Find the time context that matches the current hour
  const context = timeContexts.find(
    ctx => hour >= ctx.hourStart && hour <= ctx.hourEnd
  );
  
  if (context) {
    return context.greeting;
  }
  
  // Fallback greetings based on hour
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/**
 * Get focus phrase based on workout focus
 */
function getFocusPhrase(focus: string, focusDescriptions: FocusDescription[]): string {
  const description = focusDescriptions.find(desc => desc.focus === focus);
  return description?.phrase || '';
}

/**
 * Generate dynamic content for workout
 * @param workout - Workout data (should have a focus field or infer from muscles/segments)
 * @param userTime - Optional Date object (defaults to current time)
 * @returns Object with dynamic title and description
 */
export async function generateDynamicContent(
  workout: { 
    title?: string; 
    description?: string;
    focus?: string;
    muscles?: string[];
    segments?: Array<{ type: string }>;
  },
  userTime?: Date
): Promise<{ title: string; description: string }> {
  try {
    const currentTime = userTime || new Date();
    const currentHour = currentTime.getHours();
    
    // Fetch templates from Firebase
    const [timeContexts, focusDescriptions] = await Promise.all([
      getTimeContexts(),
      getFocusDescriptions(),
    ]);
    
    // Get greeting based on time
    const greeting = getGreetingForHour(currentHour, timeContexts);
    
    // Determine workout focus
    let workoutFocus = workout.focus;
    if (!workoutFocus) {
      // Infer focus from muscles or segments
      if (workout.muscles?.some(m => m.includes('בטן') || m.includes('core'))) {
        workoutFocus = 'abs';
      } else if (workout.muscles?.some(m => m.includes('גב') || m.includes('חזה') || m.includes('כתפיים'))) {
        workoutFocus = 'upper_body';
      } else if (workout.muscles?.some(m => m.includes('רגליים'))) {
        workoutFocus = 'lower_body';
      } else if (workout.segments?.some(s => s.type === 'running')) {
        workoutFocus = 'cardio';
      } else {
        workoutFocus = 'recovery';
      }
    }
    
    // Get focus phrase
    const focusPhrase = getFocusPhrase(workoutFocus, focusDescriptions);
    
    // Compile title and description
    const baseTitle = workout.title || 'אימון יומי';
    const dynamicTitle = `${greeting}! ${baseTitle}`;
    
    const baseDescription = workout.description || '';
    const dynamicDescription = focusPhrase 
      ? `${baseDescription} ${focusPhrase}`.trim()
      : baseDescription;
    
    return {
      title: dynamicTitle,
      description: dynamicDescription,
    };
  } catch (error) {
    console.error('[Content Service] Error generating dynamic content:', error);
    // Fallback to original content
    return {
      title: workout.title || 'אימון יומי',
      description: workout.description || '',
    };
  }
}

/**
 * CRUD Operations for Time Contexts
 */
export const TimeContextService = {
  async create(data: Omit<TimeContext, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, TIME_CONTEXTS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<TimeContext, 'id' | 'createdAt'>>): Promise<void> {
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
 * CRUD Operations for Focus Descriptions
 */
export const FocusDescriptionService = {
  async create(data: Omit<FocusDescription, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, FOCUS_DESCRIPTIONS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id: string, data: Partial<Omit<FocusDescription, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, FOCUS_DESCRIPTIONS_COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, FOCUS_DESCRIPTIONS_COLLECTION, id));
  },
};
