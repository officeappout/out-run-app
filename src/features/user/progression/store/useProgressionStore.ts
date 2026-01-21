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

  // Actions
  addCoins: (amount: number) => void;
  recordActivity: (userId: string) => Promise<{ evolved: boolean; lemurStage: number }>;
  unlockBadge: (badgeId: string) => void;
  syncFromProfile: (profile: UserFullProfile | null) => void;
  awardWorkoutRewards: (userId: string, calories: number) => Promise<void>;
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
      set({ ...initialState, isLoaded: true });
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
    });
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
