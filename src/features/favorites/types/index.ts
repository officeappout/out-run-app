/**
 * Favorite Workout Types
 *
 * Reuses SharedExercise from the share service to keep
 * serialized exercise shapes consistent across share + favorites.
 */
import type { SharedExercise } from '@/features/workout-engine/services/share.service';

export type { SharedExercise };

export interface FavoriteWorkout {
  /** Firestore auto-ID from users/{uid}/favoriteWorkouts */
  id: string;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  estimatedDuration: number;
  exerciseCount: number;
  totalPlannedSets: number;
  isRecovery: boolean;
  structure: string;
  exercises: SharedExercise[];
  equipment: string[];
  muscles: string[];
  workoutLocation?: string | null;
  /** Whether media blobs have been cached locally for offline use */
  isDownloaded: boolean;
  /** Link to sharedWorkouts/{id} if the workout was also shared */
  sharedWorkoutId?: string | null;
  savedAt: Date;
}

/** Shape written to Firestore (savedAt becomes serverTimestamp) */
export type FavoriteWorkoutWrite = Omit<FavoriteWorkout, 'id' | 'savedAt'>;
