/**
 * Hook to fetch and manage workout history
 * Fetches workouts from Firestore where userId === currentUserId, sorted by date DESC
 */
import { useState, useEffect } from 'react';
import { getWorkoutHistory, WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function useWorkoutHistory(limit: number = 50) {
  const [workouts, setWorkouts] = useState<WorkoutHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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
  }, [limit]);

  return { workouts, isLoading, error };
}
