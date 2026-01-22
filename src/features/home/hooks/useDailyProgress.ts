/**
 * Hook to fetch and listen to dailyProgress from Firestore
 * Used to sync workout completion status with home screen schedule
 */
import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';

export interface DailyProgress {
  userId: string;
  date: string;
  workoutCompleted: boolean;
  workoutType?: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid';
  displayIcon?: string; // Lucide icon name
  stepsAchieved?: number;
  floorsAchieved?: number;
  stepGoalMet?: boolean;
  floorGoalMet?: boolean;
  updatedAt?: any;
}

export function useDailyProgress(date?: string): DailyProgress | null {
  const { profile } = useUserStore();
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  
  const targetDate = date || new Date().toISOString().split('T')[0];
  const userId = profile?.id;

  useEffect(() => {
    if (!userId) {
      setDailyProgress(null);
      return;
    }

    const dailyProgressRef = doc(db, 'dailyProgress', `${userId}_${targetDate}`);
    
    // Fetch initial data
    getDoc(dailyProgressRef).then((docSnap) => {
      if (docSnap.exists()) {
        setDailyProgress(docSnap.data() as DailyProgress);
      } else {
        setDailyProgress(null);
      }
    }).catch((error) => {
      console.error('[useDailyProgress] Error fetching daily progress:', error);
      setDailyProgress(null);
    });

    // Listen to real-time updates
    const unsubscribe = onSnapshot(
      dailyProgressRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setDailyProgress(docSnap.data() as DailyProgress);
        } else {
          setDailyProgress(null);
        }
      },
      (error) => {
        console.error('[useDailyProgress] Error listening to daily progress:', error);
      }
    );

    return () => unsubscribe();
  }, [userId, targetDate]);

  return dailyProgress;
}
