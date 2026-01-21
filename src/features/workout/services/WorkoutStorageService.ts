// Workout Storage Service - Saves workout history to Firestore
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface WorkoutHistoryEntry {
  id?: string;
  userId: string;
  date: Date;
  activityType: 'running' | 'walking' | 'cycling' | 'workout';
  distance: number; // km
  duration: number; // seconds
  calories: number;
  pace: number; // minutes per km
  routePath?: [number, number][]; // GPS coordinates
  routeId?: string; // If guided route
  routeName?: string;
  earnedCoins: number;
}

/**
 * Save a completed workout to Firestore
 */
export async function saveWorkout(workout: Omit<WorkoutHistoryEntry, 'id' | 'date'>): Promise<boolean> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[WorkoutStorage] Cannot save: user not authenticated');
      return false;
    }

    const workoutData: Omit<WorkoutHistoryEntry, 'id'> = {
      ...workout,
      userId: currentUser.uid,
      date: new Date(),
    };

    const docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      date: serverTimestamp(), // Use server timestamp for consistency
    });

    console.log(`✅ Workout saved with ID: ${docRef.id}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving workout:', error);
    return false;
  }
}

/**
 * Get user's workout history (for future use)
 */
export async function getWorkoutHistory(userId: string, limit: number = 50): Promise<WorkoutHistoryEntry[]> {
  // Implementation for fetching history would go here
  // For now, just return empty array as this is not requested
  return [];
}
