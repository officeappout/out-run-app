/**
 * Unified Progression Store
 * Manages gamification state: coins, lemur evolution, badges, and domain progress
 * Syncs with useUserStore and Firestore
 */

import { create } from 'zustand';
import type { UserFullProfile } from '../../core/types/user.types';
import { getLemurStage, recordActivity as recordLemurActivity } from '../services/lemur-evolution.service';
import { awardCoins as awardCoinsToFirestore } from '../services/coin-calculator.service';
import { checkAndUnlockAchievements } from '../services/achievement.service';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserProgression } from '@/lib/firestore.service';

export interface GoalHistoryEntry {
  date: string;           // 'YYYY-MM-DD'
  stepsAchieved: number;
  floorsAchieved: number;
  stepGoalMet: boolean;   // Hit adaptive goal (not just baseline)
  floorGoalMet: boolean;
  isSuper?: boolean;      // True if this was a full workout (not just steps/floors)
}

export type ActivityType = 'micro' | 'super' | 'survival' | 'none';

interface ProgressionState {
  // Gamification Metrics
  coins: number;
  totalCaloriesBurned: number;
  daysActive: number;
  lastActiveDate: string; // 'YYYY-MM-DD' format
  lemurStage: number; // 1-10

  // Dynamic Goals (NEW)
  dailyStepGoal: number;        // Default: 3000, adjusts adaptively
  dailyFloorGoal: number;       // Default: 3, adjusts adaptively
  lastActivityType: ActivityType;  // For UI flame differentiation
  currentStreak: number;        // Days meeting at least baseline
  goalHistory: GoalHistoryEntry[];  // 3-day window for adaptive algorithm

  // Level Progress (from domain tracks)
  domainProgress: { [domain: string]: { level: number; percent: number } };

  // Badges
  unlockedBadges: string[];

  // Loading state
  isLoaded: boolean;
  isHydrated: boolean; // Flag to prevent UI jumping before initial fetch

  // Actions
  addCoins: (amount: number) => void;
  hydrateFromFirestore: (userId: string) => Promise<void>;
  recordActivity: (userId: string) => Promise<{ evolved: boolean; lemurStage: number }>;
  unlockBadge: (badgeId: string) => void;
  syncFromProfile: (profile: UserFullProfile | null) => void;
  awardWorkoutRewards: (userId: string, calories: number) => Promise<void>;
  awardWorkoutCoins: (calories: number) => Promise<void>;
  markTodayAsCompleted: (type: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid') => Promise<void>;
  setLastActivityType: (type: ActivityType) => void;
  recordDailyGoalProgress: (steps: number, floors: number) => void;
  reset: () => void;
}

const initialState = {
  coins: 0,
  totalCaloriesBurned: 0,
  daysActive: 0,
  lastActiveDate: '',
  lemurStage: 1,
  // Dynamic Goals
  dailyStepGoal: 3000,
  dailyFloorGoal: 3,
  lastActivityType: 'none' as ActivityType,
  currentStreak: 0,
  goalHistory: [] as GoalHistoryEntry[],
  domainProgress: {},
  unlockedBadges: [],
  isLoaded: false,
  isHydrated: false,
};

export const useProgressionStore = create<ProgressionState>((set, get) => ({
  ...initialState,

  /**
   * Add coins optimistically (will be synced to Firestore externally)
   */
  addCoins: (amount: number) => {
    set((state) => ({
      coins: state.coins + amount,
      totalCaloriesBurned: state.totalCaloriesBurned + amount, // Assuming 1:1
    }));
  },

  /**
   * Record activity and update lemur evolution
   * Returns evolution status
   */
  recordActivity: async (userId: string) => {
    try {
      const result = await recordLemurActivity(userId);

      // Update local state
      set({
        daysActive: result.daysActive,
        lemurStage: result.lemurStage,
        lastActiveDate: new Date().toISOString().split('T')[0],
      });

      // Check for achievements if evolved
      if (result.evolved) {
        const state = get();
        const profile = {
          progression: {
            coins: state.coins,
            totalCaloriesBurned: state.totalCaloriesBurned,
            daysActive: state.daysActive,
            lemurStage: state.lemurStage,
            unlockedBadges: state.unlockedBadges,
          },
        };

        const newBadges = await checkAndUnlockAchievements(userId, profile);
        if (newBadges.length > 0) {
          set((state) => ({
            unlockedBadges: [...state.unlockedBadges, ...newBadges],
          }));
        }
      }

      return {
        evolved: result.evolved,
        lemurStage: result.lemurStage,
      };
    } catch (error) {
      console.error('[ProgressionStore] Error recording activity:', error);
      return { evolved: false, lemurStage: get().lemurStage };
    }
  },

  /**
   * Unlock a badge (optimistic update)
   */
  unlockBadge: (badgeId: string) => {
    set((state) => ({
      unlockedBadges: state.unlockedBadges.includes(badgeId)
        ? state.unlockedBadges
        : [...state.unlockedBadges, badgeId],
    }));
  },

  /**
   * Sync state from user profile (called on app load or profile update)
   */
  syncFromProfile: (profile: UserFullProfile | null) => {
    if (!profile) {
      set({ ...initialState, isLoaded: true, isHydrated: false });
      return;
    }

    const progression = profile.progression;

    // Ensure lemurStage is correctly set from daysActive if missing
    let lemurStage = progression.lemurStage || 1;
    if (!progression.lemurStage && progression.daysActive) {
      const lemurData = getLemurStage(progression.daysActive);
      lemurStage = lemurData.stage;
    }

    set({
      coins: progression.coins || 0,
      totalCaloriesBurned: progression.totalCaloriesBurned || 0,
      daysActive: progression.daysActive || 0,
      lastActiveDate: progression.lastActiveDate || '',
      lemurStage,
      unlockedBadges: progression.unlockedBadges || [],
      domainProgress: progression.tracks || {},
      // Dynamic Goals
      dailyStepGoal: progression.dailyStepGoal || 3000,
      dailyFloorGoal: progression.dailyFloorGoal || 3,
      currentStreak: progression.currentStreak || 0,
      goalHistory: progression.goalHistory || [],
      lastActivityType: 'none', // Reset on load
      isLoaded: true,
      // Don't set isHydrated here - it should be set after Firestore fetch
    });
  },

  /**
   * Hydrate progression store from Firestore
   * Called on app load to sync coins and calories
   */
  hydrateFromFirestore: async (userId: string) => {
    try {
      if (typeof window === 'undefined') return;
      
      const progression = await getUserProgression(userId);
      if (progression) {
        set({
          coins: progression.coins || 0,
          totalCaloriesBurned: progression.totalCaloriesBurned || 0,
          isHydrated: true,
        });
        console.log(`✅ [ProgressionStore] Hydrated from Firestore: ${progression.coins} coins, ${progression.totalCaloriesBurned} calories`);
      } else {
        // No progression data yet, mark as hydrated anyway
        set({ isHydrated: true });
      }
    } catch (error) {
      console.error('[ProgressionStore] Error hydrating from Firestore:', error);
      // Mark as hydrated even on error to prevent infinite loading
      set({ isHydrated: true });
    }
  },

  /**
   * Award workout coins (coins = calories, 1:1 ratio)
   * Also marks today as completed and updates progression
   */
  awardWorkoutCoins: async (calories: number) => {
    try {
      if (typeof window === 'undefined') return;
      
      const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
      const userState = useUserStore.getState();
      const userId = userState.profile?.id;
      
      if (!userId) {
        console.warn('[ProgressionStore] No user ID available for awarding coins');
        return;
      }
      
      // Award coins to Firestore using atomic increment
      const { coins, success } = await awardCoinsToFirestore(userId, calories);
      
      if (success) {
        // Refresh from Firestore to get the updated value (ensures accuracy after increment)
        const updatedProgression = await getUserProgression(userId);
        if (updatedProgression) {
          set({
            coins: updatedProgression.coins || 0,
            totalCaloriesBurned: updatedProgression.totalCaloriesBurned || 0,
            lastActivityType: 'super' as ActivityType, // Trigger "Stronger Flame"
          });
        } else {
          // Fallback: optimistic update if refresh fails
          set((state) => ({
            coins: state.coins + coins,
            totalCaloriesBurned: state.totalCaloriesBurned + calories,
            lastActivityType: 'super' as ActivityType,
          }));
        }
        
        // Record activity (updates daysActive and lemurStage)
        const result = await get().recordActivity(userId);
        
        // Record this as a 'super' workout in goalHistory for calendar
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const existingEntry = state.goalHistory.find(entry => entry.date === today);
        
        if (existingEntry) {
          // Update existing entry to mark as super
          const updatedHistory = state.goalHistory.map(entry =>
            entry.date === today ? { ...entry, isSuper: true } : entry
          );
          set({ goalHistory: updatedHistory });
        } else {
          // Create new entry for super workout
          const newEntry: GoalHistoryEntry = {
            date: today,
            stepsAchieved: 0,
            floorsAchieved: 0,
            stepGoalMet: false,
            floorGoalMet: false,
            isSuper: true,
          };
          const updatedHistory = [newEntry, ...state.goalHistory].slice(0, 3);
          set({ goalHistory: updatedHistory });
        }
        
        console.log(
          `✅ [ProgressionStore] Coins successfully added to User Profile: ${coins} coins (${calories} calories) for user ${userId}` +
            (result.evolved ? ` 🎉 Lemur evolved to stage ${result.lemurStage}!` : '')
        );
      }
    } catch (error) {
      console.error('[ProgressionStore] Error awarding workout coins:', error);
    }
  },

  /**
   * Award workout rewards (coins + activity recording)
   * This is the main bridge called after workout completion
   */
  awardWorkoutRewards: async (userId: string, calories: number) => {
    try {
      // 1. Award coins to Firestore
      const { coins, success } = await awardCoinsToFirestore(userId, calories);

      if (success) {
        // 2. Update local state optimistically
        set((state) => ({
          coins: state.coins + coins,
          totalCaloriesBurned: state.totalCaloriesBurned + calories,
          lastActivityType: 'super' as ActivityType, // Trigger "Stronger Flame"
        }));

        // 3. Record activity (updates daysActive and lemurStage)
        const result = await get().recordActivity(userId);

        // 4. Record this as a 'super' workout in goalHistory for calendar
        const state = get();
        const today = new Date().toISOString().split('T')[0];
        const existingEntry = state.goalHistory.find(entry => entry.date === today);

        if (existingEntry) {
          // Update existing entry to mark as super
          const updatedHistory = state.goalHistory.map(entry =>
            entry.date === today ? { ...entry, isSuper: true } : entry
          );
          set({ goalHistory: updatedHistory });
        } else {
          // Create new entry for super workout
          const newEntry: GoalHistoryEntry = {
            date: today,
            stepsAchieved: 0, // Will be filled by HealthKit later
            floorsAchieved: 0,
            stepGoalMet: false,
            floorGoalMet: false,
            isSuper: true,
          };
          const updatedHistory = [newEntry, ...state.goalHistory].slice(0, 3);
          set({ goalHistory: updatedHistory });
        }

        console.log(
          `✅ [ProgressionStore] Awarded ${coins} coins to user ${userId}` +
            (result.evolved ? ` 🎉 Lemur evolved to stage ${result.lemurStage}!` : '')
        );
      }
    } catch (error) {
      console.error('[ProgressionStore] Error awarding workout rewards:', error);
    }
  },

  /**
   * Set last activity type (for UI differentiation)
   */
  setLastActivityType: (type: ActivityType) => {
    set({ lastActivityType: type });
  },

  /**
   * Record daily goal progress (steps/floors)
   * This evaluates if goals were met and updates history
   */
  recordDailyGoalProgress: (steps: number, floors: number) => {
    const state = get();
    const today = new Date().toISOString().split('T')[0];

    // Check if already recorded today
    const alreadyRecorded = state.goalHistory.some(entry => entry.date === today);
    if (alreadyRecorded) {
      return; // Don't double-record
    }

    const stepGoalMet = steps >= state.dailyStepGoal;
    const floorGoalMet = floors >= state.dailyFloorGoal;

    const newEntry: GoalHistoryEntry = {
      date: today,
      stepsAchieved: steps,
      floorsAchieved: floors,
      stepGoalMet,
      floorGoalMet,
    };

    // Keep only last 3 days
    const updatedHistory = [newEntry, ...state.goalHistory].slice(0, 3);

    set({
      goalHistory: updatedHistory,
    });
  },

  /**
   * Mark today as completed (workout done)
   * Syncs to Firestore dailyProgress collection
   */
  markTodayAsCompleted: async (type: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid') => {
    try {
      if (typeof window === 'undefined') return;
      
      const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
      const userState = useUserStore.getState();
      const userId = userState.profile?.id;
      
      if (!userId) {
        console.warn('[ProgressionStore] No user ID available for marking today as completed');
        return;
      }
      
      console.log('[ProgressionStore] Syncing progression to Firestore...');
      
      const today = new Date().toISOString().split('T')[0];
      const dailyProgressRef = doc(db, 'dailyProgress', `${userId}_${today}`);
      
      // Get existing daily progress or create new
      const existingDoc = await getDoc(dailyProgressRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      // Get workout metadata for icon display
      const getWorkoutIcon = (workoutType: string): string => {
        switch (workoutType) {
          case 'running': return 'run-fast';
          case 'walking': return 'walk';
          case 'cycling': return 'bike';
          case 'strength': return 'dumbbell';
          case 'hybrid': return 'activity';
          default: return 'run-fast';
        }
      };

      // Update with workout completion
      await setDoc(dailyProgressRef, {
        userId,
        date: today,
        workoutCompleted: true,
        workoutType: type,
        displayIcon: getWorkoutIcon(type),
        ...existingData, // Preserve other fields (steps, floors, etc.)
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Also update goalHistory in user document
      const state = get();
      const todayEntry = state.goalHistory.find(entry => entry.date === today);
      
      if (todayEntry) {
        // Update existing entry to mark as super
        const updatedHistory = state.goalHistory.map(entry =>
          entry.date === today ? { ...entry, isSuper: true } : entry
        );
        set({ goalHistory: updatedHistory });
        
        // Sync goalHistory to Firestore
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, {
          'progression.goalHistory': updatedHistory,
        });
      } else {
        // Create new entry for super workout
        const newEntry: GoalHistoryEntry = {
          date: today,
          stepsAchieved: existingData.stepsAchieved || 0,
          floorsAchieved: existingData.floorsAchieved || 0,
          stepGoalMet: existingData.stepGoalMet || false,
          floorGoalMet: existingData.floorGoalMet || false,
          isSuper: true,
        };
        const updatedHistory = [newEntry, ...state.goalHistory].slice(0, 3);
        set({ goalHistory: updatedHistory });
        
        // Sync goalHistory to Firestore
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, {
          'progression.goalHistory': updatedHistory,
        });
      }
      
      console.log('[ProgressionStore] Syncing progression to Firestore... Done.');
    } catch (error) {
      console.error('[ProgressionStore] Error marking today as completed:', error);
    }
  },

  /**
   * Reset progression state (for logout)
   */
  reset: () => {
    set(initialState);
  },
}));

/**
 * Hook to get lemur stage details
 */
export function useLemurStage() {
  const lemurStage = useProgressionStore((state) => state.lemurStage);
  const daysActive = useProgressionStore((state) => state.daysActive);
  return { lemurStage, daysActive, ...getLemurStage(daysActive) };
}
