/**
 * Hook to fetch and manage workout history
 * Fetches workouts from Firestore where userId === currentUserId, sorted by date DESC
 */
import { useState, useEffect, useCallback } from 'react';
import { getWorkoutHistory, WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useWorkoutHistory(limit: number = 50, enabled: boolean = true) {
  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // `enabled` lets a caller that owns this hook at a higher, always-mounted
    // level (e.g. ProfilePage, so the list + removeWorkout survive a sibling
    // view swap) defer the fetch until it's actually needed, instead of
    // eagerly reading on every mount of the owning component.
    if (!enabled) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setWorkouts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

      try {
        const data = await getWorkoutHistory(user.uid, limit);
        setWorkouts(data);
        setIsLoading(false);
      } catch (err) {
        console.error('[useWorkoutHistory] Error fetching workouts:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch workout history'));
        setIsLoading(false);
      }
      });

    return () => unsubscribe();
  }, [limit, enabled]);

  /**
   * getWorkoutHistory() above is a one-shot getDocs() call, NOT an
   * onSnapshot() live subscription — `workouts` state does not update on its
   * own when a doc is deleted elsewhere (e.g. WORKOUT_DELETE_EXPANDED_ENABLED
   * swipe-to-delete in HistoryTab). Callers that delete a workout must call
   * this explicitly to reflect the removal in the visible list.
   */
  const removeWorkout = useCallback((workoutId: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
  }, []);

  return { workouts, isLoading, error, removeWorkout };
}
