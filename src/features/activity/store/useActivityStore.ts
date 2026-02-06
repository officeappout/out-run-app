/**
 * Activity Store
 * 
 * Zustand store for tracking daily and weekly activity across categories.
 * Persists to localStorage AND syncs with Firestore for cross-device support.
 * 
 * Features:
 * - Track minutes for STRENGTH (Cyan), CARDIO (Lime), MAINTENANCE (Purple)
 * - Track steps and floors
 * - Calculate streak based on consecutive activity days (Firestore-backed)
 * - Determine dominant activity color for visualizations
 * - Auto-sync to Firestore on activity changes
 * - Load from Firestore on app start to prevent streak loss
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  ActivityCategory,
  DailyActivity,
  WeeklyActivitySummary,
  CategoryMetrics,
  createEmptyDailyActivity,
  createEmptyCategoryMetrics,
  DEFAULT_DAILY_GOALS,
  DEFAULT_WEEKLY_GOALS,
  STREAK_MINIMUM_MINUTES,
  ACTIVITY_COLORS,
} from '../types/activity.types';
import { activityPriorityService } from '../services/ActivityPriorityService';

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

const COLLECTION_DAILY_ACTIVITY = 'dailyActivity';
const COLLECTION_STREAK = 'streaks';

/**
 * Generate document ID for daily activity
 */
function getDailyActivityDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/**
 * Convert DailyActivity to Firestore-safe format
 */
function toFirestoreFormat(activity: DailyActivity): Record<string, unknown> {
  return {
    ...activity,
    updatedAt: serverTimestamp(),
    // Ensure categories are plain objects
    categories: {
      strength: { ...activity.categories.strength },
      cardio: { ...activity.categories.cardio },
      maintenance: { ...activity.categories.maintenance },
    },
  };
}

/**
 * Convert Firestore document to DailyActivity
 */
function fromFirestoreFormat(data: Record<string, unknown>): DailyActivity {
  return {
    ...data,
    updatedAt: data.updatedAt instanceof Timestamp 
      ? data.updatedAt.toDate() 
      : new Date(data.updatedAt as string || Date.now()),
  } as DailyActivity;
}

// ============================================================================
// STORE TYPES
// ============================================================================

interface ActivityState {
  // Current day's activity
  today: DailyActivity | null;
  
  // Week's daily activities (Map: date string -> activity)
  weekActivities: Record<string, DailyActivity>;
  
  // Weekly summary (calculated)
  weeklySummary: WeeklyActivitySummary | null;
  
  // User's primary program (affects ring order)
  userProgram: string;
  
  // Streak tracking
  currentStreak: number;
  longestStreak: number;
  
  // Dominant color for path visualization
  dominantActivityColor: string;
  
  // Store metadata
  lastSyncTimestamp: number | null;
  _hasHydrated: boolean;
}

interface ActivityActions {
  // Initialize store with user data
  initialize: (userId: string, userProgram?: string) => void;
  
  // Log activity minutes
  logActivity: (category: ActivityCategory, minutes: number) => void;
  
  // Log steps
  logSteps: (steps: number) => void;
  
  // Log floors
  logFloors: (floors: number) => void;
  
  // Log a completed workout (convenience method)
  logWorkout: (
    category: ActivityCategory,
    durationMinutes: number,
    calories?: number
  ) => void;
  
  // Set daily goals
  setDailyGoals: (goals: Partial<Record<ActivityCategory, number>>) => void;
  
  // Set user's program (affects ring priority)
  setUserProgram: (program: string) => void;
  
  // Recalculate derived values
  recalculate: () => void;
  
  // Sync with server (Firestore)
  syncToServer: () => Promise<void>;
  
  // Load from server
  loadFromServer: (userId: string, date?: string) => Promise<void>;
  
  // Get ring data for display
  getRingData: () => import('../types/activity.types').RingData[];
  
  // Get progress message
  getProgressMessage: () => string;
  
  // Reset today's data (for testing)
  resetToday: () => void;
  
  // Set hydration flag
  setHasHydrated: (state: boolean) => void;
  
  // Subscribe to real-time Firestore updates
  subscribeToChanges: (userId: string) => () => void;
}

type ActivityStore = ActivityState & ActivityActions;

// ============================================================================
// SYNC DEBOUNCE
// ============================================================================

let syncTimeout: NodeJS.Timeout | null = null;
const SYNC_DEBOUNCE_MS = 2000; // Sync 2 seconds after last change

/**
 * Debounced sync to prevent too many Firestore writes
 */
function debouncedSync(syncFn: () => Promise<void>) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(async () => {
    try {
      await syncFn();
    } catch (error) {
      console.error('[ActivityStore] Debounced sync failed:', error);
    }
  }, SYNC_DEBOUNCE_MS);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getWeekStartString(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  return weekStart.toISOString().split('T')[0];
}

function calculatePercentage(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((current / goal) * 100));
}

function updateCategoryMetrics(
  metrics: CategoryMetrics,
  additionalMinutes: number
): CategoryMetrics {
  const newMinutes = metrics.minutes + additionalMinutes;
  const newPercentage = calculatePercentage(newMinutes, metrics.goalMinutes);
  
  return {
    ...metrics,
    minutes: newMinutes,
    percentage: newPercentage,
    isGoalMet: newMinutes >= metrics.goalMinutes,
  };
}

function calculateWeeklySummary(
  weekActivities: Record<string, DailyActivity>,
  userProgram: string
): WeeklyActivitySummary {
  const weekStart = getWeekStartString();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const categoryTotals: Record<ActivityCategory, number> = {
    strength: 0,
    cardio: 0,
    maintenance: 0,
  };
  
  let activeDays = 0;
  let totalSteps = 0;
  let totalCalories = 0;
  
  Object.values(weekActivities).forEach(activity => {
    // Sum category minutes
    (Object.keys(categoryTotals) as ActivityCategory[]).forEach(cat => {
      categoryTotals[cat] += activity.categories[cat].minutes;
    });
    
    // Count active days
    const totalMinutes = Object.values(activity.categories)
      .reduce((sum, cat) => sum + cat.minutes, 0);
    if (totalMinutes >= STREAK_MINIMUM_MINUTES) {
      activeDays++;
    }
    
    totalSteps += activity.steps;
    totalCalories += activity.calories;
  });
  
  const categoryGoals = activityPriorityService.getWeeklyGoals(userProgram);
  
  const categoryPercentages: Record<ActivityCategory, number> = {
    strength: calculatePercentage(categoryTotals.strength, categoryGoals.strength),
    cardio: calculatePercentage(categoryTotals.cardio, categoryGoals.cardio),
    maintenance: calculatePercentage(categoryTotals.maintenance, categoryGoals.maintenance),
  };
  
  // Find dominant category
  let maxPercentage = 0;
  let dominantCategory: ActivityCategory = 'strength';
  (Object.keys(categoryPercentages) as ActivityCategory[]).forEach(cat => {
    if (categoryPercentages[cat] > maxPercentage) {
      maxPercentage = categoryPercentages[cat];
      dominantCategory = cat;
    }
  });
  
  return {
    weekStart,
    weekEnd: weekEnd.toISOString().split('T')[0],
    categoryTotals,
    categoryGoals,
    categoryPercentages,
    activeDays,
    streakAtWeekEnd: 0, // Will be calculated separately
    dominantCategory,
    totalSteps,
    totalCalories,
  };
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set, get) => ({
      // Initial state
      today: null,
      weekActivities: {},
      weeklySummary: null,
      userProgram: 'full_body',
      currentStreak: 0,
      longestStreak: 0,
      dominantActivityColor: ACTIVITY_COLORS.strength.hex,
      lastSyncTimestamp: null,
      _hasHydrated: false,
      
      // Actions
      initialize: (userId: string, userProgram?: string) => {
        const todayStr = getTodayString();
        const state = get();
        
        // Check if we need to create today's activity
        let today = state.today;
        if (!today || today.date !== todayStr || today.userId !== userId) {
          today = createEmptyDailyActivity(userId, todayStr);
          
          // Apply program-specific goals
          const program = userProgram || state.userProgram;
          const dailyGoals = activityPriorityService.getDailyGoals(program);
          const weeklyGoals = activityPriorityService.getWeeklyGoals(program);
          
          (Object.keys(dailyGoals) as ActivityCategory[]).forEach(cat => {
            today!.categories[cat].goalMinutes = dailyGoals[cat];
            today!.categories[cat].weeklyGoalMinutes = weeklyGoals[cat];
          });
        }
        
        set({
          today,
          userProgram: userProgram || state.userProgram,
        });
        
        get().recalculate();
      },
      
      logActivity: (category: ActivityCategory, minutes: number) => {
        const state = get();
        if (!state.today) return;
        
        const updatedCategories = {
          ...state.today.categories,
          [category]: updateCategoryMetrics(state.today.categories[category], minutes),
        };
        
        set({
          today: {
            ...state.today,
            categories: updatedCategories,
            updatedAt: new Date(),
          },
        });
        
        get().recalculate();
        
        // Auto-sync to Firestore (debounced)
        debouncedSync(() => get().syncToServer());
      },
      
      logSteps: (steps: number) => {
        const state = get();
        if (!state.today) return;
        
        const newSteps = state.today.steps + steps;
        
        set({
          today: {
            ...state.today,
            steps: newSteps,
            stepsGoalMet: newSteps >= state.today.stepsGoal,
            updatedAt: new Date(),
          },
        });
        
        get().recalculate();
        
        // Auto-sync to Firestore (debounced)
        debouncedSync(() => get().syncToServer());
      },
      
      logFloors: (floors: number) => {
        const state = get();
        if (!state.today) return;
        
        const newFloors = state.today.floors + floors;
        
        set({
          today: {
            ...state.today,
            floors: newFloors,
            floorsGoalMet: newFloors >= state.today.floorsGoal,
            updatedAt: new Date(),
          },
        });
        
        get().recalculate();
        
        // Auto-sync to Firestore (debounced)
        debouncedSync(() => get().syncToServer());
      },
      
      logWorkout: (
        category: ActivityCategory,
        durationMinutes: number,
        calories?: number
      ) => {
        const state = get();
        if (!state.today) return;
        
        const updatedCategories = {
          ...state.today.categories,
          [category]: updateCategoryMetrics(state.today.categories[category], durationMinutes),
        };
        
        // Update streak - workout counts as activity
        const totalMinutes = Object.values(updatedCategories)
          .reduce((sum, cat) => sum + cat.minutes, 0);
        
        let newStreak = state.currentStreak;
        if (totalMinutes >= STREAK_MINIMUM_MINUTES && state.currentStreak === 0) {
          // First activity of the day that meets threshold
          newStreak = state.currentStreak + 1;
        }
        
        set({
          today: {
            ...state.today,
            categories: updatedCategories,
            calories: state.today.calories + (calories || 0),
            updatedAt: new Date(),
          },
          currentStreak: newStreak,
          longestStreak: Math.max(state.longestStreak, newStreak),
        });
        
        get().recalculate();
        
        // Immediate sync for workouts (important data)
        get().syncToServer().catch(err => 
          console.error('[ActivityStore] Workout sync failed:', err)
        );
      },
      
      setDailyGoals: (goals: Partial<Record<ActivityCategory, number>>) => {
        const state = get();
        if (!state.today) return;
        
        const updatedCategories = { ...state.today.categories };
        
        (Object.keys(goals) as ActivityCategory[]).forEach(cat => {
          if (goals[cat] !== undefined) {
            updatedCategories[cat] = {
              ...updatedCategories[cat],
              goalMinutes: goals[cat]!,
              percentage: calculatePercentage(updatedCategories[cat].minutes, goals[cat]!),
              isGoalMet: updatedCategories[cat].minutes >= goals[cat]!,
            };
          }
        });
        
        set({
          today: {
            ...state.today,
            categories: updatedCategories,
          },
        });
      },
      
      setUserProgram: (program: string) => {
        set({ userProgram: program });
        
        const state = get();
        if (state.today) {
          // Update goals based on new program
          const dailyGoals = activityPriorityService.getDailyGoals(program);
          get().setDailyGoals(dailyGoals);
        }
        
        get().recalculate();
      },
      
      recalculate: () => {
        const state = get();
        if (!state.today) return;
        
        // Calculate dominant category
        const dominantCategory = activityPriorityService.calculateDominantCategory(state.today);
        
        // Calculate dominant color
        const dominantColor = activityPriorityService.getDominantActivityColor(
          state.today,
          state.userProgram
        );
        
        // Determine activity type
        const activityType = activityPriorityService.determineActivityType(state.today);
        
        // Update week activities with today
        const todayStr = getTodayString();
        const updatedWeekActivities = {
          ...state.weekActivities,
          [todayStr]: {
            ...state.today,
            dominantCategory,
            activityType,
          },
        };
        
        // Calculate weekly summary
        const weeklySummary = calculateWeeklySummary(updatedWeekActivities, state.userProgram);
        
        set({
          today: {
            ...state.today,
            dominantCategory,
            activityType,
          },
          weekActivities: updatedWeekActivities,
          weeklySummary,
          dominantActivityColor: dominantColor,
        });
      },
      
      syncToServer: async () => {
        const state = get();
        if (!state.today || !state.today.userId) {
          console.warn('[ActivityStore] Cannot sync: no today data or userId');
          return;
        }
        
        try {
          const docId = getDailyActivityDocId(state.today.userId, state.today.date);
          const docRef = doc(db, COLLECTION_DAILY_ACTIVITY, docId);
          
          // Save daily activity
          await setDoc(docRef, toFirestoreFormat(state.today), { merge: true });
          
          // Update streak document
          const streakRef = doc(db, COLLECTION_STREAK, state.today.userId);
          await setDoc(streakRef, {
            userId: state.today.userId,
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            lastActivityDate: state.today.date,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          set({ lastSyncTimestamp: Date.now() });
          console.log('[ActivityStore] Synced to Firestore successfully');
        } catch (error) {
          console.error('[ActivityStore] Error syncing to Firestore:', error);
          throw error;
        }
      },
      
      loadFromServer: async (userId: string, date?: string) => {
        const targetDate = date || getTodayString();
        
        try {
          // 1. Load today's activity
          const docId = getDailyActivityDocId(userId, targetDate);
          const docRef = doc(db, COLLECTION_DAILY_ACTIVITY, docId);
          const docSnap = await getDoc(docRef);
          
          let todayActivity: DailyActivity;
          
          if (docSnap.exists()) {
            todayActivity = fromFirestoreFormat(docSnap.data());
            console.log('[ActivityStore] Loaded today from Firestore:', todayActivity.date);
          } else {
            // Create new day
            todayActivity = createEmptyDailyActivity(userId, targetDate);
            console.log('[ActivityStore] No Firestore data, created new day');
          }
          
          // 2. Load streak data
          const streakRef = doc(db, COLLECTION_STREAK, userId);
          const streakSnap = await getDoc(streakRef);
          
          let currentStreak = 0;
          let longestStreak = 0;
          
          if (streakSnap.exists()) {
            const streakData = streakSnap.data();
            currentStreak = streakData.currentStreak || 0;
            longestStreak = streakData.longestStreak || 0;
            
            // Check if streak is still valid (last activity was yesterday or today)
            const lastActivityDate = streakData.lastActivityDate;
            if (lastActivityDate) {
              const daysDiff = Math.floor(
                (new Date(targetDate).getTime() - new Date(lastActivityDate).getTime()) 
                / (1000 * 60 * 60 * 24)
              );
              
              if (daysDiff > 1) {
                // Streak broken (missed more than 1 day)
                currentStreak = 0;
                console.log('[ActivityStore] Streak broken - missed days');
              }
            }
          }
          
          // 3. Load past week's activities for weekly summary
          const weekStart = getWeekStartString();
          const weekActivitiesQuery = query(
            collection(db, COLLECTION_DAILY_ACTIVITY),
            where('userId', '==', userId),
            where('date', '>=', weekStart),
            orderBy('date', 'desc'),
            limit(7)
          );
          
          const weekSnapshot = await getDocs(weekActivitiesQuery);
          const weekActivities: Record<string, DailyActivity> = {};
          
          weekSnapshot.forEach((docSnap) => {
            const data = fromFirestoreFormat(docSnap.data());
            weekActivities[data.date] = data;
          });
          
          // Add today if not in the query results
          weekActivities[targetDate] = todayActivity;
          
          // 4. Calculate streak from history if needed
          if (currentStreak === 0 && Object.keys(weekActivities).length > 0) {
            const sortedDates = Object.keys(weekActivities).sort().reverse();
            let calculatedStreak = 0;
            
            for (const activityDate of sortedDates) {
              const activity = weekActivities[activityDate];
              const totalMinutes = Object.values(activity.categories)
                .reduce((sum, cat) => sum + cat.minutes, 0);
              
              if (totalMinutes >= STREAK_MINIMUM_MINUTES) {
                calculatedStreak++;
              } else if (activityDate !== targetDate) {
                // Don't break on today (day not finished yet)
                break;
              }
            }
            
            currentStreak = calculatedStreak;
          }
          
          // 5. Update store
          const state = get();
          set({
            today: todayActivity,
            weekActivities,
            currentStreak,
            longestStreak: Math.max(longestStreak, currentStreak),
            userProgram: state.userProgram,
          });
          
          // 6. Recalculate derived values
          get().recalculate();
          
          console.log('[ActivityStore] Loaded from Firestore - Streak:', currentStreak);
        } catch (error) {
          console.error('[ActivityStore] Error loading from Firestore:', error);
          // Fallback to local initialization
          get().initialize(userId);
        }
      },
      
      getRingData: () => {
        const state = get();
        if (!state.today) return [];
        
        return activityPriorityService.buildRingData(state.today, state.userProgram);
      },
      
      getProgressMessage: () => {
        const state = get();
        if (!state.today) return 'בוא נתחיל לזוז!';
        
        return activityPriorityService.getProgressMessage(state.today, state.userProgram);
      },
      
      resetToday: () => {
        const state = get();
        if (!state.today) return;
        
        set({
          today: createEmptyDailyActivity(state.today.userId, getTodayString()),
        });
        
        get().recalculate();
      },
      
      setHasHydrated: (hasHydrated: boolean) => {
        set({ _hasHydrated: hasHydrated });
      },
      
      subscribeToChanges: (userId: string) => {
        const todayStr = getTodayString();
        const docId = getDailyActivityDocId(userId, todayStr);
        const docRef = doc(db, COLLECTION_DAILY_ACTIVITY, docId);
        
        // Subscribe to real-time updates for today's activity
        const unsubscribeActivity = onSnapshot(
          docRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = fromFirestoreFormat(docSnap.data());
              const state = get();
              
              // Only update if the server data is newer
              const serverTime = data.updatedAt instanceof Date ? data.updatedAt.getTime() : 0;
              const localTime = state.today?.updatedAt instanceof Date ? state.today.updatedAt.getTime() : 0;
              
              if (serverTime > localTime) {
                set({ today: data });
                get().recalculate();
                console.log('[ActivityStore] Updated from Firestore real-time');
              }
            }
          },
          (error) => {
            console.error('[ActivityStore] Real-time listener error:', error);
          }
        );
        
        // Subscribe to streak updates
        const streakRef = doc(db, COLLECTION_STREAK, userId);
        const unsubscribeStreak = onSnapshot(
          streakRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const state = get();
              
              // Update streak if server has higher value (sync from other devices)
              if (data.currentStreak > state.currentStreak) {
                set({
                  currentStreak: data.currentStreak,
                  longestStreak: Math.max(state.longestStreak, data.longestStreak || 0),
                });
                console.log('[ActivityStore] Streak updated from Firestore:', data.currentStreak);
              }
            }
          },
          (error) => {
            console.error('[ActivityStore] Streak listener error:', error);
          }
        );
        
        // Return unsubscribe function
        return () => {
          unsubscribeActivity();
          unsubscribeStreak();
        };
      },
    }),
    {
      name: 'out-activity-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        today: state.today,
        weekActivities: state.weekActivities,
        userProgram: state.userProgram,
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastSyncTimestamp: state.lastSyncTimestamp,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          
          // Check if today's data is stale
          if (state.today && state.today.date !== getTodayString()) {
            // New day - archive yesterday and create fresh today
            const userId = state.today.userId;
            state.initialize(userId);
          }
        }
      },
    }
  )
);

// ============================================================================
// SELECTOR HOOKS
// ============================================================================

/**
 * Get today's activity
 */
export const useTodayActivity = () => useActivityStore((state) => state.today);

/**
 * Get ring data for display
 */
export const useRingData = () => useActivityStore((state) => state.getRingData());

/**
 * Get dominant activity color
 */
export const useDominantColor = () => useActivityStore((state) => state.dominantActivityColor);

/**
 * Get weekly summary
 */
export const useWeeklySummary = () => useActivityStore((state) => state.weeklySummary);

/**
 * Get progress message
 */
export const useProgressMessage = () => useActivityStore((state) => state.getProgressMessage());

/**
 * Get streak info
 */
export const useStreak = () => useActivityStore((state) => ({
  current: state.currentStreak,
  longest: state.longestStreak,
}));
