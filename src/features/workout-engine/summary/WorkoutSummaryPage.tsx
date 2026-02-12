'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { calculateCalories } from '@/lib/calories.utils';
import { updateUserProgression } from '@/lib/firestore.service';
import { auth } from '@/lib/firebase';
import { saveWorkout } from '@/features/workout-engine/core/services/storage.service';
import SummaryOrchestrator, {
  WorkoutData,
  WorkoutType,
} from './components/SummaryOrchestrator';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import { calculateBaseWorkoutXP, calculateLevelFromXP, getProgressToNextLevel } from '@/features/user/progression/services/xp.service';
import { getAllLevels } from '@/features/content/programs/core/level.service';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface WorkoutSummaryPageProps {
  onFinish: () => void;
  workoutType?: WorkoutType;
}

export default function WorkoutSummaryPage({
  onFinish,
  workoutType = 'FREE_RUN',
}: WorkoutSummaryPageProps) {
  const router = useRouter();
  const { totalDistance, totalDuration } = useSessionStore();
  const { currentPace, routeCoords, activityType, laps, clearRunningData } =
    useRunningPlayer();
  const { profile, updateProfile } = useUserStore();
  const { currentStreak } = useProgressionStore();
  const [mounted, setMounted] = useState(false);

  // Calculate calories and coins
  const userWeight = profile?.core?.weight || 70;
  const calories = calculateCalories(
    activityType,
    Math.floor(totalDuration / 60),
    userWeight
  );
  // COIN_SYSTEM_PAUSED: Re-enable in April
  const earnedCoins = IS_COIN_SYSTEM_ENABLED ? Math.floor(calories) : 0;

  // Guest Logic detection
  const isGuest = profile?.id && !profile.core?.email;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFinish = async () => {
    if (isGuest) {
      // Basic Guest Finish
      clearRunningData();
      useSessionStore.getState().clearSession();
      onFinish();
      router.push('/home');
      return;
    }

    // 1. WORKOUT-TO-PROGRESSION BRIDGE: Award coins and record activity
    const currentUser = auth.currentUser;
    if (currentUser && profile) {
      try {
        // Award workout rewards (coins + lemur evolution)
        // COIN_SYSTEM_PAUSED: awardWorkoutRewards already checks IS_COIN_SYSTEM_ENABLED
        const { useProgressionStore } = await import(
          '@/features/user/progression/store/useProgressionStore'
        );
        await useProgressionStore.getState().awardWorkoutRewards(
          currentUser.uid,
          calories
        );

        console.log(
          IS_COIN_SYSTEM_ENABLED 
            ? `✅ [WorkoutSummary] Awarded ${earnedCoins} coins and recorded activity`
            : `[WorkoutSummary] COIN_SYSTEM_PAUSED - Recorded activity only (${calories} calories)`
        );

        // Legacy: Also update local profile for immediate UI update
        const currentCoins = profile.progression?.coins || 0;
        const currentCalories = profile.progression?.totalCaloriesBurned || 0;
        updateProfile({
          progression: {
            ...profile.progression,
            // COIN_SYSTEM_PAUSED: Don't increment coins when system is disabled
            coins: IS_COIN_SYSTEM_ENABLED ? currentCoins + earnedCoins : currentCoins,
            totalCaloriesBurned: currentCalories + calories,
          },
        });
      } catch (error) {
        console.error('[WorkoutSummary] Error awarding workout rewards:', error);
      }
    }

    // 2. Save Workout History
    if (profile) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const currentCoins = profile.progression?.coins || 0;
          // COIN_SYSTEM_PAUSED: Don't increment coins when system is disabled
          const newCoins = IS_COIN_SYSTEM_ENABLED ? currentCoins + earnedCoins : currentCoins;
          const newTotalCalories =
            (profile.progression?.totalCaloriesBurned || 0) + calories;

          await updateUserProgression(currentUser.uid, {
            coins: newCoins,
            totalCaloriesBurned: newTotalCalories,
          });
          console.log(IS_COIN_SYSTEM_ENABLED 
            ? '✅ Coins and calories synced to Firestore'
            : '✅ COIN_SYSTEM_PAUSED - Calories only synced to Firestore'
          );

          // Save workout to history
          await saveWorkout({
            userId: currentUser.uid,
            activityType: activityType || 'running',
            distance: totalDistance,
            duration: totalDuration,
            calories: calories,
            pace: currentPace || 0,
            routePath:
              routeCoords.length > 0
                ? (routeCoords as [number, number][])
                : undefined,
            // COIN_SYSTEM_PAUSED: Record 0 coins when system is disabled
            earnedCoins: IS_COIN_SYSTEM_ENABLED ? earnedCoins : 0,
          });
          console.log('✅ Workout saved to history');

          // 2b. Award XP (hidden — user only sees %)
          try {
            const durationMin = Math.round(totalDuration / 60);
            const baseXP = calculateBaseWorkoutXP(durationMin, 2, 'cardio');

            const userDocRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const userData = userSnap.data();
              const currentXP = userData.progression?.globalXP || 0;
              const newXP = currentXP + baseXP;

              const levels = await getAllLevels();
              const newLevel = calculateLevelFromXP(newXP, levels);
              const pct = getProgressToNextLevel(newXP, newLevel, levels);

              await updateDoc(userDocRef, {
                'progression.globalXP': newXP,
                'progression.globalLevel': newLevel,
              });

              console.log(`[XP] +${baseXP} XP (hidden). Progress: ${Math.round(pct)}% → Level ${newLevel + 1}`);
            }
          } catch (xpErr) {
            console.error('[XP] Failed to award XP:', xpErr);
          }
        } catch (error) {
          console.error('❌ Error syncing to Firestore:', error);
        }
      }
    }

    // 3. State Reset
    clearRunningData();
    useSessionStore.getState().clearSession();

    // 4. Smart Navigation -> Home
    onFinish();
    router.push('/home');
  };

  const handleClaim = () => {
    // Redirect to Onboarding with fixed bonus for Guest signup
    const queryParams = new URLSearchParams({
      claim: 'true',
      coins: '20',
      calories: calories.toString(),
    }).toString();

    router.push(`/onboarding?${queryParams}`);
  };

  if (!mounted) {
    return (
      <div className="h-[100dvh] w-full bg-white flex items-center justify-center">
        <p className="text-gray-500">טוען...</p>
      </div>
    );
  }

  // Prepare workout data
  const workoutData: WorkoutData = {
    time: totalDuration,
    distance: totalDistance,
    calories: calories,
    routeCoords: routeCoords,
    laps: laps.filter((lap) => !lap.isActive || lap.distanceMeters > 0), // Only completed laps
    date: new Date(),
    title: 'האימון הושלם!',
    motivationalMessage: 'כל הכבוד! המשך כך!',
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] bg-gray-50 text-gray-900 flex flex-col h-[100dvh] overflow-y-auto"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        <SummaryOrchestrator
          workoutData={workoutData}
          workoutType={workoutType}
          streakDays={currentStreak}
        />
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent z-[101] pb-[env(safe-area-inset-bottom)]">
        {isGuest ? (
          <div className="flex gap-4 max-w-4xl mx-auto">
            <button
              onClick={handleFinish}
              className="flex-1 py-4 rounded-xl font-bold text-gray-500 hover:bg-white transition-colors border border-gray-200 bg-white"
            >
              וותר
            </button>
            <button
              onClick={handleClaim}
              className="flex-[2] py-4 rounded-xl font-black text-lg bg-[#00E5FF] text-black hover:bg-[#00D4EE] transition-all shadow-lg"
            >
              השלם פרופיל וקבל בונוס (+20 מטבעות)
            </button>
          </div>
        ) : (
          <button
            onClick={handleFinish}
            className="w-full max-w-4xl mx-auto py-4 rounded-xl font-bold bg-[#00E5FF] text-black hover:bg-[#00D4EE] transition-all shadow-lg"
          >
            סיום וחזרה לבית
          </button>
        )}
      </div>
    </div>
  );
}
