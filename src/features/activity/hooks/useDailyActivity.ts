/**
 * useDailyActivity Hook
 * 
 * Provides convenient access to daily activity data for UI components.
 * Combines data from the ActivityStore with user profile information.
 * 
 * Usage:
 * ```tsx
 * const { ringData, progressMessage, dominantColor, isLoading } = useDailyActivity();
 * ```
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActivityStore } from '../store/useActivityStore';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';
import { 
  RingData, 
  DailyActivity,
  ActivityCategory,
  WeeklyActivitySummary,
} from '../types/activity.types';
import { activityPriorityService } from '../services/ActivityPriorityService';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyActivityResult {
  /** Ring data for ConcentricRingsProgress component */
  ringData: RingData[];
  
  /** Today's full activity record */
  todayActivity: DailyActivity | null;
  
  /** Weekly summary */
  weeklySummary: WeeklyActivitySummary | null;
  
  /** Motivational progress message */
  progressMessage: string;
  
  /** Dominant activity color (for path visualization) */
  dominantColor: string;
  
  /** Current streak count */
  streak: number;
  
  /** Total minutes today */
  totalMinutesToday: number;
  
  /** Steps today */
  stepsToday: number;
  
  /** Floors today */
  floorsToday: number;
  
  /** Calories today */
  caloriesToday: number;
  
  /** Whether all daily goals are met */
  allGoalsMet: boolean;
  
  /** Whether any daily goal is met */
  anyGoalMet: boolean;
  
  /** Whether the store has finished loading */
  isLoading: boolean;
  
  /** User's primary program */
  userProgram: string;
  
  /** Ring priority order based on program */
  priorityOrder: [ActivityCategory, ActivityCategory, ActivityCategory];
  
  // Actions
  /** Log activity minutes */
  logActivity: (category: ActivityCategory, minutes: number) => void;
  
  /** Log a completed workout */
  logWorkout: (category: ActivityCategory, durationMinutes: number, calories?: number) => void;
  
  /** Log steps */
  logSteps: (steps: number) => void;
  
  /** Log floors */
  logFloors: (floors: number) => void;
  
  /** Refresh data from server */
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useDailyActivity(): DailyActivityResult {
  const { profile, _hasHydrated: userHydrated } = useUserStore();
  
  const {
    today,
    weekActivities,
    weeklySummary,
    userProgram,
    currentStreak,
    dominantActivityColor,
    _hasHydrated: activityHydrated,
    initialize,
    logActivity,
    logWorkout,
    logSteps,
    logFloors,
    loadFromServer,
    getRingData,
    getProgressMessage,
  } = useActivityStore();

  // Gate every Firestore read below on Firebase Auth being ready. The persisted
  // user store can rehydrate `profile.id` BEFORE onAuthStateChanged attaches the
  // auth token (common on native / WKWebView cold start from server.url), so
  // subscribing on `profile.id` alone fires reads while `request.auth == null` →
  // Firestore rejects with permission-denied (the dailyActivity/streaks rules
  // require only isAuthenticated(), so a null token is the sole failure mode).
  // `authReady` flips true once auth resolves, re-running the effects with a token.
  const [authReady, setAuthReady] = useState<boolean>(() => auth.currentUser != null);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => setAuthReady(user != null));
    return () => unsub();
  }, []);

  // Initialize activity store when user is available
  useEffect(() => {
    if (userHydrated && profile?.id && activityHydrated && authReady) {
      // Derive primary program for ring priority:
      // 1. Persona Engine: primaryTrack → canonical program alias
      // 2. Legacy fallback: first domain key from progression
      let primaryProgram: string;

      const trackToProgram: Record<string, string> = {
        health: 'full_body',
        strength: 'calisthenics',
        run: 'running',
        hybrid: 'full_body',
      };

      const primaryTrack = profile.lifestyle?.primaryTrack;
      if (primaryTrack && trackToProgram[primaryTrack]) {
        primaryProgram = trackToProgram[primaryTrack];
      } else {
        // Legacy: alphabetical first domain key (pre-Persona users)
        primaryProgram = profile.progression?.domains
          ? Object.keys(profile.progression.domains)[0] || 'full_body'
          : 'full_body';
      }
      
      // Load from Firestore first (to get streak data)
      loadFromServer(profile.id).then(() => {
        // Then initialize with user program
        initialize(profile.id, primaryProgram);
      });
    }
  }, [userHydrated, profile?.id, activityHydrated, authReady, initialize, loadFromServer]);
  
  // Subscribe to real-time Firestore updates
  useEffect(() => {
    if (!profile?.id || !activityHydrated || !authReady) return;

    const { subscribeToChanges } = useActivityStore.getState();
    const unsubscribe = subscribeToChanges(profile.id);

    return () => {
      unsubscribe();
    };
  }, [profile?.id, activityHydrated, authReady]);

  // Force a fresh server re-read whenever the outbox's health-sample queue
  // depth changes (i.e. OutboxFlusher just wrote something to Firestore).
  //
  // Why this exists, not just the onSnapshot listener above: that listener
  // only applies incoming data `if (serverTime > localTime)` (see
  // useActivityStore.subscribeToChanges), comparing today.updatedAt against
  // a client-stamped `new Date()` that createEmptyDailyActivity() sets the
  // moment initialize() runs on mount — right around the same time the
  // outbox is still draining a fresh backfill. loadFromServer() has no such
  // guard (it unconditionally overwrites `today` with whatever Firestore
  // has), so falling back to it here is what actually makes a first-mount
  // backfill land without the user having to leave the screen and come
  // back for a fresh, guard-free read to happen.
  //
  // Debounced so a multi-pass drain (see OutboxFlusher.runOnce) coalesces
  // into one read shortly after depth stops changing, instead of firing a
  // Firestore read per pass.
  useEffect(() => {
    if (!profile?.id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const off = OutboxFlusher.onDepthChange(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadFromServer(profile.id!);
      }, 1_500);
    });
    return () => {
      off();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [profile?.id, loadFromServer]);

  // Calculate derived values
  const ringData = useMemo(() => getRingData(), [today, userProgram]);
  
  const progressMessage = useMemo(() => getProgressMessage(), [today, userProgram]);
  
  const priorityOrder = useMemo(() => 
    activityPriorityService.getPriorityOrder(userProgram),
    [userProgram]
  );
  
  const totalMinutesToday = useMemo(() => {
    if (!today) return 0;
    return Object.values(today.categories)
      .reduce((sum, cat) => sum + cat.minutes, 0);
  }, [today]);
  
  const allGoalsMet = useMemo(() => {
    if (!today) return false;
    return Object.values(today.categories)
      .every(cat => cat.isGoalMet);
  }, [today]);
  
  const anyGoalMet = useMemo(() => {
    if (!today) return false;
    return Object.values(today.categories)
      .some(cat => cat.isGoalMet);
  }, [today]);
  
  const isLoading = !userHydrated || !activityHydrated;
  
  // Refresh function
  const refresh = async () => {
    if (profile?.id) {
      await loadFromServer(profile.id);
    }
  };
  
  return {
    ringData,
    todayActivity: today,
    weeklySummary,
    progressMessage,
    dominantColor: dominantActivityColor,
    streak: currentStreak,
    totalMinutesToday,
    stepsToday: today?.steps ?? 0,
    floorsToday: today?.floors ?? 0,
    caloriesToday: today?.calories ?? 0,
    allGoalsMet,
    anyGoalMet,
    isLoading,
    userProgram,
    priorityOrder,
    logActivity,
    logWorkout,
    logSteps,
    logFloors,
    refresh,
  };
}

// ============================================================================
// ADDITIONAL HOOKS
// ============================================================================

/**
 * Get just the ring data (optimized for ring display)
 */
export function useActivityRings(): {
  rings: RingData[];
  isLoading: boolean;
} {
  const { getRingData, _hasHydrated, today, userProgram } = useActivityStore();
  
  const rings = useMemo(() => getRingData(), [today, userProgram]);
  
  return {
    rings,
    isLoading: !_hasHydrated,
  };
}

/**
 * Get activity for a specific category
 */
export function useCategoryActivity(category: ActivityCategory): {
  minutes: number;
  goal: number;
  percentage: number;
  isGoalMet: boolean;
  color: string;
  logMinutes: (minutes: number) => void;
} {
  const { today, logActivity, getRingData } = useActivityStore();
  const rings = getRingData();
  
  const ring = rings.find(r => r.id === category);
  const metrics = today?.categories[category];
  
  return {
    minutes: metrics?.minutes ?? 0,
    goal: metrics?.goalMinutes ?? 30,
    percentage: metrics?.percentage ?? 0,
    isGoalMet: metrics?.isGoalMet ?? false,
    color: ring?.color ?? '#06B6D4',
    logMinutes: (minutes: number) => logActivity(category, minutes),
  };
}

/**
 * Get weekly progress for display
 */
export function useWeeklyProgress(): {
  summary: WeeklyActivitySummary | null;
  daysWithActivity: number;
  totalMinutes: number;
  dominantCategory: ActivityCategory | null;
  isLoading: boolean;
} {
  const { weeklySummary, weekActivities, _hasHydrated } = useActivityStore();
  
  const daysWithActivity = useMemo(() => {
    return Object.values(weekActivities).filter(day => {
      const total = Object.values(day.categories)
        .reduce((sum, cat) => sum + cat.minutes, 0);
      return total >= 10;
    }).length;
  }, [weekActivities]);
  
  const totalMinutes = useMemo(() => {
    if (!weeklySummary) return 0;
    return Object.values(weeklySummary.categoryTotals)
      .reduce((sum, mins) => sum + mins, 0);
  }, [weeklySummary]);
  
  return {
    summary: weeklySummary,
    daysWithActivity,
    totalMinutes,
    dominantCategory: weeklySummary?.dominantCategory ?? null,
    isLoading: !_hasHydrated,
  };
}

export default useDailyActivity;
