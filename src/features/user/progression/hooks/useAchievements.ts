'use client';

/**
 * useAchievements — Achievement check + unlock orchestration hook.
 *
 * Runs a full achievement evaluation pass once per session (after data loads)
 * and again whenever the total workout count increases (new workout logged).
 *
 * Responsibilities:
 *   1. Aggregate UserAchievementStats from available data sources.
 *   2. Call achievement.service.checkAndPersistAchievements (Firestore write).
 *   3. Optimistically update progressionStore.unlockedAchievements.
 *   4. Award XP via progressionStore.awardBonusXP (routes to Guardian CF).
 *   5. Return a toast queue so the UI can present unlock animations.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProgressionStore } from '../store/useProgressionStore';
import { useWorkoutHistory } from '@/features/profile/hooks/useWorkoutHistory';
import { checkAndPersistAchievements } from '../services/achievement.service';
import type {
  NewlyUnlockedItem,
  UnlockedAchievementsMap,
  UserAchievementStats,
} from '../types/achievement.types';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

// ─────────────────────────────────────────────────────────────────────────────
// Stats computation (pure)
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(
  workouts: WorkoutHistoryEntry[],
  daysActive: number,
  currentStreak: number,
): UserAchievementStats {
  const now = Date.now();
  const MS_7D  = 7  * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  const isCardio = (w: WorkoutHistoryEntry) =>
    w.workoutType === 'running' || w.workoutType === 'walking' || w.workoutType === 'cycling';

  const runningWorkouts = workouts.filter(isCardio);
  const strengthWorkouts = workouts.filter((w) => w.category === 'strength');
  // "outdoor" = any workout detected near a park
  const outdoorWorkouts = workouts.filter((w) => !!w.parkId);

  const totalRunningKm = runningWorkouts.reduce((s, w) => s + (w.distance || 0), 0);
  const longestRunKm   = runningWorkouts.reduce((m, w) => Math.max(m, w.distance || 0), 0);

  const runsInLast7Days = runningWorkouts.filter(
    (w) => w.date.getTime() >= now - MS_7D,
  ).length;
  const strengthWorkoutsInLastWeek = strengthWorkouts.filter(
    (w) => w.date.getTime() >= now - MS_7D,
  ).length;
  const strengthWorkoutsInLastMonth = strengthWorkouts.filter(
    (w) => w.date.getTime() >= now - MS_30D,
  ).length;

  // Special one-time achievements derived from workout timestamps
  const hasWorkoutBefore7am = workouts.some((w) => w.date.getHours() < 7);
  // Day 5 = Friday in JS (Sun=0, Mon=1, ... Fri=5)
  const hasWorkoutOnFriday  = workouts.some((w) => w.date.getDay() === 5);

  return {
    daysActive,
    currentStreak,
    totalWorkouts: workouts.length,
    totalRunningKm,
    longestRunKm,
    totalStrengthWorkouts: strengthWorkouts.length,
    runsInLast7Days,
    strengthWorkoutsInLastWeek,
    strengthWorkoutsInLastMonth,
    outdoorWorkouts: outdoorWorkouts.length,
    hasWorkoutBefore7am,
    hasWorkoutOnFriday,
    // Exercise PRs — require a dedicated exercise-history fetch (future)
    pullupMaxReps:   0,
    pushupMaxReps:   0,
    squatMaxReps:    0,
    plankMaxSeconds: 0,
    // Social — require social-store / connections fetch (future)
    followersCount:  0,
    followingCount:  0,
    groupsJoined:    0,
    // Other external data — populated when data sources are connected
    partnerWorkouts: 0,
    uniqueParks:     0,
    parkSessions:    0,
    leagueRank:      null,
    leagueWeeklyWins:0,
    hasWorkoutInRain:false,
    messagesSent:    0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAchievementsReturn {
  unlockedAchievements: UnlockedAchievementsMap;
  /** Queue of achievements unlocked this session — consume with dismissToast(). */
  toastQueue: NewlyUnlockedItem[];
  dismissToast: () => void;
  totalUnlocked: number;
  isChecking: boolean;
}

/**
 * @param userId - Firebase UID of the current user.
 * @param externalWorkouts - Optional workout list fetched by the parent component.
 *   Pass this to avoid a redundant Firestore fetch when the parent already has the data.
 * @param externalIsLoading - Loading state paired with externalWorkouts.
 */
export function useAchievements(
  userId: string | null | undefined,
  externalWorkouts?: WorkoutHistoryEntry[],
  externalIsLoading?: boolean,
): UseAchievementsReturn {
  const daysActive            = useProgressionStore((s) => s.daysActive);
  const currentStreak         = useProgressionStore((s) => s.currentStreak);
  const isHydrated            = useProgressionStore((s) => s.isHydrated);
  const unlockedAchievements  = useProgressionStore((s) => s.unlockedAchievements);
  const unlockAchievement     = useProgressionStore((s) => s.unlockAchievement);
  const awardBonusXP          = useProgressionStore((s) => s.awardBonusXP);

  // Always call the hook (React rules) — use results only when no external data provided
  const internalHistory = useWorkoutHistory(50);
  const workouts = externalWorkouts ?? internalHistory.workouts;
  const isLoading = externalIsLoading ?? internalHistory.isLoading;

  const [toastQueue, setToastQueue] = useState<NewlyUnlockedItem[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Track last workout count that triggered a check to avoid duplicate runs
  const lastCheckedWorkoutCountRef = useRef<number>(-1);
  // Debounce timer ref
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback(async () => {
    if (!userId || !isHydrated || isLoading) return;
    if (lastCheckedWorkoutCountRef.current === workouts.length) return;

    lastCheckedWorkoutCountRef.current = workouts.length;
    setIsChecking(true);

    try {
      const stats = computeStats(workouts, daysActive, currentStreak);
      const newItems = await checkAndPersistAchievements(userId, stats, unlockedAchievements);

      if (newItems.length > 0) {
        // Apply to local store + award XP for each unlock
        for (const item of newItems) {
          const key = item.tier
            ? `${item.achievement.id}_${item.tier}`
            : item.achievement.id;
          unlockAchievement(key, {
            unlockedAt: new Date().toISOString(),
            xpAwarded: item.xpAwarded,
            ...(item.tier ? { tier: item.tier } : {}),
          });
          if (item.xpAwarded > 0) {
            awardBonusXP(
              item.xpAwarded,
              `achievement:${key}`,
            ).catch((e) =>
              console.warn('[useAchievements] XP award failed (non-critical):', e),
            );
          }
        }
        // Enqueue toasts
        setToastQueue((prev) => [...prev, ...newItems]);
      }
    } catch (e) {
      console.error('[useAchievements] Check failed:', e);
    } finally {
      setIsChecking(false);
    }
  }, [
    userId, isHydrated, isLoading,
    workouts, daysActive, currentStreak,
    unlockedAchievements, unlockAchievement, awardBonusXP,
  ]);

  // Trigger check when data is ready or workout list grows
  useEffect(() => {
    if (!userId || !isHydrated || isLoading) return;

    // Debounce to avoid rapid re-checks while data settles
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      runCheck();
    }, 600);

    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, [userId, isHydrated, isLoading, workouts.length, runCheck]);

  // Reset check counter when user changes
  useEffect(() => {
    lastCheckedWorkoutCountRef.current = -1;
  }, [userId]);

  const dismissToast = useCallback(() => {
    setToastQueue((prev) => prev.slice(1));
  }, []);

  const totalUnlocked = Object.keys(unlockedAchievements).length;

  return {
    unlockedAchievements,
    toastQueue,
    dismissToast,
    totalUnlocked,
    isChecking,
  };
}
