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
  updateDoc,
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
import { useUserStore } from '@/features/user/identity/store/useUserStore';

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
  // Some documents (e.g. an early/partial write for an anonymous/guest user)
  // may be missing one or more category keys entirely. Every downstream
  // consumer of `today.categories` (buildRingData, calculateDominantCategory,
  // etc.) indexes it with a fixed ActivityCategory key and assumes it exists —
  // normalize here, once, at the hydration boundary, rather than adding a
  // guard at every call site.
  const rawCategories = (data.categories ?? {}) as Partial<DailyActivity['categories']>;
  const categories: DailyActivity['categories'] = {
    strength: rawCategories.strength ?? createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.strength, DEFAULT_WEEKLY_GOALS.strength),
    cardio: rawCategories.cardio ?? createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.cardio, DEFAULT_WEEKLY_GOALS.cardio),
    maintenance: rawCategories.maintenance ?? createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.maintenance, DEFAULT_WEEKLY_GOALS.maintenance),
  };

  return {
    ...data,
    categories,
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
  /** 'YYYY-MM-DD' of the last day the streak threshold was crossed.
   *  Persisted to localStorage so logWorkout can detect missed days
   *  even when loadFromServer hasn't completed yet. */
  lastStreakDate: string;
  
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

  // Log a completed multi-category workout ATOMICALLY (hybrid: cardio legs +
  // strength station). All categories land in ONE synchronous state update and
  // ONE syncToServer() → a single Firestore write with every category present.
  // This avoids the two-write clobber race that back-to-back logWorkout() calls
  // would cause (each fires its own async syncToServer with merge:true, so a
  // late-landing cardio write could zero the strength minutes). Streak/goal are
  // derived once from the combined GLOBAL total, not per category.
  logMultiCategoryWorkout: (
    entries: Array<{ category: ActivityCategory; durationMinutes: number; calories?: number }>
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
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekStartString(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const y = weekStart.getFullYear();
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const weekEndDate = new Date(weekStart + 'T00:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndY = weekEndDate.getFullYear();
  const weekEndM = String(weekEndDate.getMonth() + 1).padStart(2, '0');
  const weekEndD = String(weekEndDate.getDate()).padStart(2, '0');
  const weekEnd = `${weekEndY}-${weekEndM}-${weekEndD}`;
  
  const categoryTotals: Record<ActivityCategory, number> = {
    strength: 0,
    cardio: 0,
    maintenance: 0,
  };
  
  const categorySessions: Record<ActivityCategory, number> = {
    strength: 0,
    cardio: 0,
    maintenance: 0,
  };
  
  let activeDays = 0;
  let totalSteps = 0;
  let totalCalories = 0;
  
  Object.values(weekActivities).forEach(activity => {
    // Sum category minutes and sessions
    (Object.keys(categoryTotals) as ActivityCategory[]).forEach(cat => {
      categoryTotals[cat] += activity.categories[cat].minutes;
      categorySessions[cat] += activity.categories[cat].sessions ?? 0;
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
    weekEnd,
    categoryTotals,
    categorySessions,
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
      lastStreakDate: '',
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
        let state = get();

        // Auto-initialize today if the store hasn't loaded yet
        if (!state.today || state.today.date !== getTodayString()) {
          const todayStr = getTodayString();
          const userId = state.today?.userId || '';
          console.warn(
            `[ActivityStore] logWorkout called with stale/missing today ` +
            `(had=${state.today?.date}, need=${todayStr}). Auto-initializing.`,
          );
          set({ today: createEmptyDailyActivity(userId, todayStr) });
          state = get();
          if (!state.today) return;
        }
        
        const updatedMetrics = updateCategoryMetrics(state.today.categories[category], durationMinutes);
        updatedMetrics.sessions = (state.today.categories[category].sessions ?? 0) + 1;
        
        const updatedCategories = {
          ...state.today.categories,
          [category]: updatedMetrics,
        };
        
        // Streak logic:
        // - Only increments the FIRST time the daily threshold is crossed (prevTotal guard)
        // - Resets to 1 (instead of N+1) when the persisted lastStreakDate shows a gap > 1 day,
        //   preventing stale localStorage cache from silently continuing a broken streak
        //   before loadFromServer has had a chance to validate against Firestore.
        const prevTotalMinutes = Object.values(state.today.categories)
          .reduce((sum, cat) => sum + cat.minutes, 0);
        const totalMinutes = Object.values(updatedCategories)
          .reduce((sum, cat) => sum + cat.minutes, 0);

        let newStreak = state.currentStreak;
        let newLastStreakDate = state.lastStreakDate;

        const justCrossedThreshold =
          prevTotalMinutes < STREAK_MINIMUM_MINUTES &&
          totalMinutes >= STREAK_MINIMUM_MINUTES;

        if (justCrossedThreshold) {
          const todayStr = getTodayString();

          if (newLastStreakDate === todayStr) {
            // Already counted today — no-op (safety net; prevTotal guard above
            // normally prevents reaching here, but belt-and-suspenders)
          } else if (newLastStreakDate) {
            const daysDiff = Math.floor(
              (new Date(todayStr).getTime() - new Date(newLastStreakDate).getTime())
              / (1000 * 60 * 60 * 24),
            );
            if (daysDiff > 1) {
              // Missed at least one day → reset streak to 1 rather than N+1
              newStreak = 1;
              console.log(
                `[ActivityStore] Streak reset to 1 (${daysDiff} day gap since ${newLastStreakDate})`,
              );
            } else {
              // Yesterday was active → continue the streak
              newStreak = state.currentStreak + 1;
            }
          } else {
            // No prior streak date on record → start fresh
            newStreak = 1;
          }

          newLastStreakDate = todayStr;
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
          lastStreakDate: newLastStreakDate,
        });
        
        get().recalculate();

        // Immediate sync for workouts (important data)
        get().syncToServer().catch(err =>
          console.error('[ActivityStore] Workout sync failed:', err)
        );
      },

      logMultiCategoryWorkout: (entries) => {
        let state = get();

        // Auto-initialize today if the store hasn't loaded yet (mirrors logWorkout).
        if (!state.today || state.today.date !== getTodayString()) {
          const todayStr = getTodayString();
          const userId = state.today?.userId || '';
          console.warn(
            `[ActivityStore] logMultiCategoryWorkout called with stale/missing today ` +
            `(had=${state.today?.date}, need=${todayStr}). Auto-initializing.`,
          );
          set({ today: createEmptyDailyActivity(userId, todayStr) });
          state = get();
          if (!state.today) return;
        }

        // Accumulate EVERY category into one categories object → one atomic write.
        // sessions is +1 per category (a hybrid is one cardio + one strength session).
        const updatedCategories = { ...state.today.categories };
        let addedCalories = 0;
        for (const entry of entries) {
          if (!entry || entry.durationMinutes <= 0) continue;
          const metrics = updateCategoryMetrics(updatedCategories[entry.category], entry.durationMinutes);
          metrics.sessions = (updatedCategories[entry.category].sessions ?? 0) + 1;
          updatedCategories[entry.category] = metrics;
          addedCalories += entry.calories || 0;
        }

        // Streak derives from the combined GLOBAL total, computed ONCE (not per
        // category) — identical policy to logWorkout, applied to the merged sum.
        const prevTotalMinutes = Object.values(state.today.categories)
          .reduce((sum, cat) => sum + cat.minutes, 0);
        const totalMinutes = Object.values(updatedCategories)
          .reduce((sum, cat) => sum + cat.minutes, 0);

        let newStreak = state.currentStreak;
        let newLastStreakDate = state.lastStreakDate;

        const justCrossedThreshold =
          prevTotalMinutes < STREAK_MINIMUM_MINUTES &&
          totalMinutes >= STREAK_MINIMUM_MINUTES;

        if (justCrossedThreshold) {
          const todayStr = getTodayString();
          if (newLastStreakDate === todayStr) {
            // Already counted today — no-op (safety net).
          } else if (newLastStreakDate) {
            const daysDiff = Math.floor(
              (new Date(todayStr).getTime() - new Date(newLastStreakDate).getTime())
              / (1000 * 60 * 60 * 24),
            );
            newStreak = daysDiff > 1 ? 1 : state.currentStreak + 1;
          } else {
            newStreak = 1;
          }
          newLastStreakDate = todayStr;
        }

        set({
          today: {
            ...state.today,
            categories: updatedCategories,
            calories: state.today.calories + addedCalories,
            updatedAt: new Date(),
          },
          currentStreak: newStreak,
          longestStreak: Math.max(state.longestStreak, newStreak),
          lastStreakDate: newLastStreakDate,
        });

        get().recalculate();

        // Single immediate sync — one Firestore write carrying every category.
        get().syncToServer().catch(err =>
          console.error('[ActivityStore] Multi-category workout sync failed:', err)
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
          
          // Save daily activity — include scope fields for step leaderboard queries
          const userProfile = useUserStore.getState().profile;
          const activityScopeExtra: Record<string, unknown> = {};
          if (userProfile?.core?.authorityId) activityScopeExtra.authorityId = userProfile.core.authorityId;
          if (userProfile?.core?.name) activityScopeExtra.displayName = userProfile.core.name;

          // Read the current server baseline so a store write (triggered by a
          // minutes / workout change) never clobbers the higher passive step /
          // floor counts written by the ingestHealthSamples Cloud Function.
          // We reconcile with Math.max and override only those two counters.
          // Note: local state.today.steps/floors are intentionally NOT mutated —
          // the subscribeToChanges snapshot listener self-heals local state from
          // the server after this write.
          let serverSteps = 0;
          let serverFloors = 0;
          try {
            const existingSnap = await getDoc(docRef);
            if (existingSnap.exists()) {
              const existingData = existingSnap.data();
              serverSteps = typeof existingData.steps === 'number' ? existingData.steps : 0;
              serverFloors = typeof existingData.floors === 'number' ? existingData.floors : 0;
            }
          } catch (readErr) {
            console.warn('[ActivityStore] Could not read server baseline before sync; using local values:', readErr);
          }

          const mergedSteps = Math.max(serverSteps, state.today.steps);
          const mergedFloors = Math.max(serverFloors, state.today.floors);

          await setDoc(
            docRef,
            {
              ...toFirestoreFormat(state.today),
              // Reconciled passive counters — never regress below server value
              steps: mergedSteps,
              stepsGoalMet: mergedSteps >= state.today.stepsGoal,
              floors: mergedFloors,
              floorsGoalMet: mergedFloors >= state.today.floorsGoal,
              ...activityScopeExtra,
            },
            { merge: true },
          );
          
          // Update streak document — include scope fields for leaderboard queries
          const streakRef = doc(db, COLLECTION_STREAK, state.today.userId);
          await setDoc(streakRef, {
            userId: state.today.userId,
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            lastActivityDate: state.today.date,
            ...(userProfile?.core?.authorityId ? { authorityId: userProfile.core.authorityId } : {}),
            ...(userProfile?.core?.name ? { displayName: userProfile.core.name } : {}),
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Mirror streak into users/{uid}.progression.currentStreak so that
          // useProgressionStore (which reads from the users doc) stays in sync.
          // This closes the two-system divergence: streaks/{uid} and
          // users/{uid}.progression.currentStreak previously lived in separate
          // Firestore paths that were never written together.
          // Best-effort: a failure here is non-critical — the streak was already
          // saved to streaks/{uid} above, and the next hydrateFromFirestore call
          // will reconcile via the forwardOrKeep listener.
          try {
            const userDocRef = doc(db, 'users', state.today.userId);
            await updateDoc(userDocRef, {
              'progression.currentStreak': state.currentStreak,
              'progression.longestStreak': Math.max(state.longestStreak, state.currentStreak),
            });
          } catch (mirrorErr) {
            console.warn('[ActivityStore] Non-critical: failed to mirror streak to users doc:', mirrorErr);
          }

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
          
          let restoredLastStreakDate = '';

          if (streakSnap.exists()) {
            const streakData = streakSnap.data();
            currentStreak = streakData.currentStreak || 0;
            longestStreak = streakData.longestStreak || 0;
            restoredLastStreakDate = streakData.lastActivityDate || '';

            // Check if streak is still valid (last activity was yesterday or today)
            if (restoredLastStreakDate) {
              const daysDiff = Math.floor(
                (new Date(targetDate).getTime() - new Date(restoredLastStreakDate).getTime())
                / (1000 * 60 * 60 * 24),
              );

              if (daysDiff > 1) {
                // Streak broken — also clear the local date so logWorkout starts fresh
                currentStreak = 0;
                restoredLastStreakDate = '';
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
          const existingWeek = get().weekActivities ?? {};
          const weekActivities: Record<string, DailyActivity> = {};
          
          weekSnapshot.forEach((docSnap) => {
            const serverDay = fromFirestoreFormat(docSnap.data());
            const localDay = existingWeek[serverDay.date];

            // Merge: keep whichever version has more sessions per category
            if (localDay) {
              const merged = { ...serverDay };
              (['strength', 'cardio', 'maintenance'] as const).forEach((cat) => {
                const localSessions = localDay.categories?.[cat]?.sessions ?? 0;
                const serverSessions = serverDay.categories?.[cat]?.sessions ?? 0;
                const localMinutes = localDay.categories?.[cat]?.minutes ?? 0;
                const serverMinutes = serverDay.categories?.[cat]?.minutes ?? 0;
                if (localSessions > serverSessions || localMinutes > serverMinutes) {
                  merged.categories = {
                    ...merged.categories,
                    [cat]: { ...localDay.categories[cat] },
                  };
                }
              });
              weekActivities[serverDay.date] = merged;
            } else {
              weekActivities[serverDay.date] = serverDay;
            }
          });
          
          // Preserve any local-only days not yet in Firestore
          for (const [dateStr, localDay] of Object.entries(existingWeek)) {
            if (!weekActivities[dateStr] && dateStr >= weekStart) {
              weekActivities[dateStr] = localDay;
            }
          }

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
          
          // 5. Update store — merge today with local state to avoid losing
          //    sessions logged before Firestore write completed
          const state = get();
          let mergedToday = todayActivity;
          if (state.today && state.today.date === targetDate && state.today.userId === userId) {
            (['strength', 'cardio', 'maintenance'] as const).forEach((cat) => {
              const localSessions = state.today!.categories[cat]?.sessions ?? 0;
              const serverSessions = mergedToday.categories[cat]?.sessions ?? 0;
              const localMinutes = state.today!.categories[cat]?.minutes ?? 0;
              const serverMinutes = mergedToday.categories[cat]?.minutes ?? 0;
              if (localSessions > serverSessions || localMinutes > serverMinutes) {
                mergedToday = {
                  ...mergedToday,
                  categories: {
                    ...mergedToday.categories,
                    [cat]: { ...state.today!.categories[cat] },
                  },
                };
              }
            });
          }
          weekActivities[targetDate] = mergedToday;

          set({
            today: mergedToday,
            weekActivities,
            currentStreak,
            longestStreak: Math.max(longestStreak, currentStreak),
            lastStreakDate: restoredLastStreakDate,
            userProgram: state.userProgram,
          });
          
          // 6. Recalculate derived values
          get().recalculate();
          
          console.log('[ActivityStore] Loaded from Firestore - Streak:', currentStreak);
        } catch (error) {
          const err = error as Error & { code?: string };
          console.error('[ActivityStore] Error loading from Firestore:', err.message ?? error);
          if (err.code) console.error('Firestore error code:', err.code);

          if (err.code === 'failed-precondition') {
            // ONLY a missing composite index throws this. Queries hit it (e.g. the
            // weekActivities query: WHERE userId == uid + orderBy date desc). Open
            // the Indexes page and create the auto-suggested index:
            // eslint-disable-next-line no-console
            console.log(
              '%c🔥 MISSING FIRESTORE INDEX → %s',
              'color: orange; font-weight: bold',
              'https://console.firebase.google.com/project/appout-1/firestore/indexes',
            );
            console.error('Needed composite index on `dailyActivity`: userId (Asc), date (Desc).');
            // Firestore also prints a clickable auto-create URL in the stack:
            if (err.stack) console.error('Stack (may contain auto-create URL):', err.stack);
          } else if (err.code === 'permission-denied') {
            // NOT an index problem. Security Rules rejected the read — almost always
            // because it fired before Firebase Auth was ready (request.auth == null).
            // The dailyActivity/streaks rules require only isAuthenticated(), so a
            // missing auth token is the sole failure mode. Verify the load/subscribe
            // is gated on auth.currentUser (see useDailyActivity's authReady gate).
            console.error(
              '[ActivityStore] permission-denied is a Security-Rules/auth issue, NOT a missing ' +
              'index. Ensure this read fires only while authenticated (auth token attached).',
            );
          }

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

        let unsubActivity: (() => void) | undefined;
        let unsubStreak: (() => void) | undefined;

        // Subscribe to real-time updates for today's activity
        try {
          unsubActivity = onSnapshot(
            docRef,
            (docSnap) => {
              if (docSnap.exists()) {
                const data = fromFirestoreFormat(docSnap.data());
                const state = get();

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
              console.warn('[ActivityStore] Real-time listener error (non-fatal):', error?.code ?? error);
            },
          );
        } catch (err) {
          console.warn('[ActivityStore] Failed to create activity listener:', err);
        }

        // Subscribe to streak updates
        try {
          const streakRef = doc(db, COLLECTION_STREAK, userId);
          unsubStreak = onSnapshot(
            streakRef,
            (docSnap) => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                const state = get();

                if (data.currentStreak > state.currentStreak) {
                  set({
                    currentStreak: data.currentStreak,
                    longestStreak: Math.max(state.longestStreak, data.longestStreak || 0),
                    // Keep lastStreakDate in sync with the authoritative server value
                    lastStreakDate: data.lastActivityDate || state.lastStreakDate,
                  });
                  console.log('[ActivityStore] Streak updated from Firestore:', data.currentStreak);
                }
              }
            },
            (error) => {
              console.warn('[ActivityStore] Streak listener error (non-fatal):', error?.code ?? error);
            },
          );
        } catch (err) {
          console.warn('[ActivityStore] Failed to create streak listener:', err);
        }

        return () => {
          unsubActivity?.();
          unsubStreak?.();
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
        lastStreakDate: state.lastStreakDate,
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
