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
import { calculateStrengthWorkoutXP, calculateRunningWorkoutXP, calculateCommuteXP, calculateLevelFromXP } from '../services/xp.service';
import type { StrengthWorkoutXPParams, RunningWorkoutXPParams, CommuteWorkoutXPParams } from '../services/xp.service';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserProgression } from '@/lib/firestore.service';
import { awardWorkoutXP as guardianAward } from '@/lib/awardWorkoutXP';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

export interface GoalHistoryEntry {
  date: string;           // 'YYYY-MM-DD'
  stepsAchieved: number;
  floorsAchieved: number;
  stepGoalMet: boolean;   // Hit adaptive goal (not just baseline)
  floorGoalMet: boolean;
  isSuper?: boolean;      // True if this was a full workout (not just steps/floors)
}

export type ActivityType = 'micro' | 'super' | 'survival' | 'none';

// Session progress tracking for real-time updates
interface SessionProgressState {
  baselinePercent: number;      // Percent at start of session
  baselineLevel: number;        // Level at start of session
  currentSets: number;          // Sets completed so far
  requiredSets: number;         // Required sets for full gain
  baseGain: number;             // Base session gain %
}

interface ProgressionState {
  // Gamification Metrics
  coins: number;
  totalCaloriesBurned: number;
  daysActive: number;
  lastActiveDate: string; // 'YYYY-MM-DD' format
  lemurStage: number; // 1-10

  // Global XP & Level (lifetime accumulator, mapped to 10-level curve)
  globalXP: number;
  globalLevel: number;

  // Dynamic Goals (NEW)
  dailyStepGoal: number;        // Default: 3000, adjusts adaptively
  dailyFloorGoal: number;       // Default: 3, adjusts adaptively
  lastActivityType: ActivityType;  // For UI flame differentiation
  currentStreak: number;        // Days meeting at least baseline
  goalHistory: GoalHistoryEntry[];  // 3-day window for adaptive algorithm

  // Level Progress (from domain tracks)
  domainProgress: { [domain: string]: { level: number; percent: number } };
  
  // Session tracking for real-time progress updates
  sessionProgress: { [domain: string]: SessionProgressState };

  // Badges
  unlockedBadges: string[];

  // Loading state
  isLoaded: boolean;
  isHydrated: boolean; // Flag to prevent UI jumping before initial fetch

  // Actions
  addCoins: (amount: number) => void;
  hydrateFromFirestore: (userId: string) => Promise<void>;
  /** Set up a real-time Firestore onSnapshot listener on the user document.
   *  Returns an unsubscribe function. Safe to call multiple times — deduplicates. */
  subscribeToProgression: (userId: string) => Unsubscribe;
  recordActivity: (userId: string) => Promise<{ evolved: boolean; lemurStage: number }>;
  unlockBadge: (badgeId: string) => void;
  syncFromProfile: (profile: UserFullProfile | null) => void;
  awardWorkoutRewards: (userId: string, calories: number) => Promise<void>;
  awardWorkoutCoins: (calories: number) => Promise<void>;
  awardStrengthXP: (params: StrengthWorkoutXPParams) => Promise<{ xpEarned: number; newLevel: number; leveledUp: boolean }>;
  awardRunningXP: (params: RunningWorkoutXPParams) => Promise<{ xpEarned: number; newLevel: number; leveledUp: boolean }>;
  /** Award global XP for a commute (A-to-B navigation) session. Slimmer formula than awardRunningXP — see xp-rules.ts. */
  awardCommuteXP: (params: CommuteWorkoutXPParams) => Promise<{ xpEarned: number; newLevel: number; leveledUp: boolean }>;
  /** Award a flat XP bonus (e.g. for completing a LevelGoal). Uses atomic Firestore increment. */
  awardBonusXP: (xp: number, reason?: string) => Promise<{ xpEarned: number; newLevel: number; leveledUp: boolean }>;
  markTodayAsCompleted: (type: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid') => Promise<void>;
  setLastActivityType: (type: ActivityType) => void;
  recordDailyGoalProgress: (steps: number, floors: number) => void;
  updateDomainProgress: (domain: string, level: number, percent: number) => void;
  startSession: (domain: string, baseGain: number, requiredSets: number) => void;
  updateSessionSets: (domain: string, currentSets: number) => void;
  endSession: (domain: string) => void;
  reset: () => void;
}

const initialState = {
  coins: 0,
  totalCaloriesBurned: 0,
  daysActive: 0,
  lastActiveDate: '',
  lemurStage: 1,
  globalXP: 0,
  globalLevel: 1,
  // Dynamic Goals
  dailyStepGoal: 3000,
  dailyFloorGoal: 3,
  lastActivityType: 'none' as ActivityType,
  currentStreak: 0,
  goalHistory: [] as GoalHistoryEntry[],
  domainProgress: {},
  sessionProgress: {} as { [domain: string]: SessionProgressState },
  unlockedBadges: [],
  isLoaded: false,
  isHydrated: false,
};

/** Module-level map: userId → active Firestore onSnapshot unsubscribe fn.
 *  Kept outside the store so it survives store resets and hot-reloads. */
const _progressionUnsubscribe = new Map<string, Unsubscribe>();

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
      globalXP: progression.globalXP || 0,
      globalLevel: progression.globalLevel || 1,
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
   * Hydrate all progression fields from a one-shot Firestore read.
   * Also starts a real-time onSnapshot listener (via subscribeToProgression)
   * so the store stays in sync after any subsequent Firestore write.
   *
   * IMPORTANT: getUserProgression (getDoc) runs BEFORE subscribeToProgression
   * (onSnapshot). This ensures the SDK cache is warm with server data before
   * the listener fires, preventing stale cache values (e.g. globalXP: 0)
   * from overwriting the freshly hydrated data.
   *
   * If the Firestore SDK is bricked (INTERNAL ASSERTION FAILED), the getDoc
   * call will throw. In that case the store falls back to the most recent
   * successful hydration cached in sessionStorage, so the UI never shows
   * all-zeros after a crash.
   */
  hydrateFromFirestore: async (userId: string) => {
    try {
      if (typeof window === 'undefined') return;

      // Idempotency guard: if already hydrated AND the real-time listener is
      // active for this userId, there is nothing more to do. This prevents
      // multiple callers (DashboardTab, UserHeaderPill, etc.) from each
      // kicking off a redundant getDoc round-trip and causing the
      // "Hydrated 4 times" re-render loop.
      if (get().isHydrated && _progressionUnsubscribe.has(userId)) return;

      // 1. One-shot server read — warms the SDK cache with authoritative data
      const progression = await getUserProgression(userId);
      if (progression) {
        set({
          coins: progression.coins,
          totalCaloriesBurned: progression.totalCaloriesBurned,
          globalXP: progression.globalXP,
          globalLevel: progression.globalLevel,
          daysActive: progression.daysActive,
          lemurStage: progression.lemurStage,
          currentStreak: progression.currentStreak,
          lastActiveDate: progression.lastActiveDate,
          isHydrated: true,
        });
        console.log(
          `✅ [ProgressionStore] Hydrated: coins=${progression.coins}, XP=${progression.globalXP} (L${progression.globalLevel}), daysActive=${progression.daysActive}`,
        );

        // Cache for SDK crash recovery
        try { sessionStorage.setItem('_prog_cache', JSON.stringify(progression)); } catch { /* quota */ }
      } else {
        set({ isHydrated: true });
      }

      // 2. Start the live listener AFTER initial data is set (idempotent)
      get().subscribeToProgression(userId);
    } catch (error) {
      console.error('[ProgressionStore] Error hydrating from Firestore:', error);

      // Fallback: restore from the most recent successful hydration
      try {
        const cached = typeof window !== 'undefined' ? sessionStorage.getItem('_prog_cache') : null;
        if (cached) {
          const p = JSON.parse(cached);
          set({
            coins: p.coins ?? 0,
            totalCaloriesBurned: p.totalCaloriesBurned ?? 0,
            globalXP: p.globalXP ?? 0,
            globalLevel: p.globalLevel ?? 1,
            daysActive: p.daysActive ?? 0,
            lemurStage: p.lemurStage ?? 1,
            currentStreak: p.currentStreak ?? 0,
            lastActiveDate: p.lastActiveDate ?? '',
            isHydrated: true,
          });
          console.warn('[ProgressionStore] Recovered from sessionStorage cache');
        } else {
          set({ isHydrated: true });
        }
      } catch {
        set({ isHydrated: true });
      }

      // Still try to start the listener so future writes are picked up
      try { get().subscribeToProgression(userId); } catch { /* swallow */ }
    }
  },

  /**
   * Real-time Firestore listener on the user document.
   *
   * Keeps globalXP, globalLevel, daysActive, lemurStage, currentStreak, coins
   * updated the instant any write lands in Firestore — no refresh needed.
   *
   * Safe to call multiple times: deduplicates by userId.
   *
   * Guards:
   * - Stale cache snapshots are skipped when the store is already hydrated.
   * - On listener error the broken subscription is torn down and retried
   *   with exponential backoff (max 3 retries) so a transient permission
   *   or network error doesn't brick the SDK for the rest of the session.
   */
  subscribeToProgression: (userId: string) => {
    const prev = _progressionUnsubscribe.get(userId);
    if (prev) return prev;

    let retryCount = 0;
    const MAX_RETRIES = 3;

    const createListener = (): Unsubscribe => {
      try {
        const userDocRef = doc(db, 'users', userId);
        const unsubscribe = onSnapshot(
          userDocRef,
          (snap) => {
            if (!snap.exists()) return;

            // Skip stale cache snapshots that could overwrite freshly-hydrated
            // server data with local zeros (the `??`/`0` race condition).
            if (snap.metadata.fromCache && get().isHydrated) return;

            retryCount = 0; // reset on any successful delivery

            const p = snap.data().progression || {};

            // "Only Forward" rule — never let incoming Firestore data shrink
            // a value that is already known to be higher in local state.
            // This prevents the elastic-band effect where a stale cache
            // snapshot (globalXP: 0) temporarily overwrites a freshly-awarded
            // value (globalXP: 73) that was set optimistically.
            const forwardOrKeep = <T extends number | string>(
              incoming: T | undefined,
              current: T,
            ): T => {
              if (incoming === undefined || incoming === null) return current;
              if (typeof incoming === 'number' && typeof current === 'number') {
                return (incoming as number) >= (current as number) ? incoming : current;
              }
              return incoming;
            };

            set((state) => ({
              coins:                forwardOrKeep(p.coins,                state.coins),
              totalCaloriesBurned:  forwardOrKeep(p.totalCaloriesBurned,  state.totalCaloriesBurned),
              globalXP:             forwardOrKeep(p.globalXP,             state.globalXP),
              globalLevel:          forwardOrKeep(p.globalLevel,          state.globalLevel),
              daysActive:           forwardOrKeep(p.daysActive,           state.daysActive),
              lemurStage:           forwardOrKeep(p.lemurStage,           state.lemurStage),
              currentStreak:        forwardOrKeep(p.currentStreak,        state.currentStreak),
              lastActiveDate:       p.lastActiveDate ?? state.lastActiveDate,
              isHydrated: true,
            }));
          },
          (error) => {
            console.error('[ProgressionStore] onSnapshot error:', error);

            // Tear down the broken listener so the SDK can recover
            try { unsubscribe(); } catch { /* already dead */ }
            _progressionUnsubscribe.delete(userId);

            // Retry with exponential backoff
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              const delay = Math.min(2000 * Math.pow(2, retryCount), 30_000);
              console.warn(`[ProgressionStore] Retrying onSnapshot in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
              setTimeout(() => {
                if (_progressionUnsubscribe.has(userId)) return; // already re-subscribed
                const newUnsub = createListener();
                _progressionUnsubscribe.set(userId, newUnsub);
              }, delay);
            }
          },
        );
        return unsubscribe;
      } catch (err) {
        console.error('[ProgressionStore] Failed to create onSnapshot listener:', err);
        return () => {}; // no-op unsubscribe
      }
    };

    const unsubscribe = createListener();
    _progressionUnsubscribe.set(userId, unsubscribe);
    return unsubscribe;
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
          // COIN_SYSTEM_PAUSED: Only update coins if system is enabled, always update calories
          set((state) => ({
            coins: IS_COIN_SYSTEM_ENABLED ? (updatedProgression.coins || 0) : state.coins,
            totalCaloriesBurned: updatedProgression.totalCaloriesBurned || 0,
            lastActivityType: 'super' as ActivityType, // Trigger "Stronger Flame"
          }));
        } else {
          // Fallback: optimistic update if refresh fails
          // COIN_SYSTEM_PAUSED: Only add coins if system is enabled
          set((state) => ({
            coins: IS_COIN_SYSTEM_ENABLED ? state.coins + coins : state.coins,
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
      // 1. Award coins to Firestore (respects IS_COIN_SYSTEM_ENABLED)
      const { coins, success } = await awardCoinsToFirestore(userId, calories);

      if (success) {
        // 2. Update local state optimistically
        // COIN_SYSTEM_PAUSED: Only add coins to local state if system is enabled
        set((state) => ({
          coins: IS_COIN_SYSTEM_ENABLED ? state.coins + coins : state.coins,
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
   * Award global XP after a strength workout using the overhauled formula.
   * Uses atomic Firestore increment for globalXP and sets the derived globalLevel.
   */
  awardStrengthXP: async (params: StrengthWorkoutXPParams) => {
    const state = get();
    const previousLevel = state.globalLevel;

    try {
      const xpEarned = calculateStrengthWorkoutXP(params);
      const newTotalXP = state.globalXP + xpEarned;
      const newLevel = calculateLevelFromXP(newTotalXP, []);
      const leveledUp = newLevel > previousLevel;

      // Optimistic local update — keep UI responsive while the Guardian call
      // is in flight. The onSnapshot listener will reconcile to the
      // authoritative server value when the write lands.
      set({ globalXP: newTotalXP, globalLevel: newLevel });

      // Persist via the Guardian Cloud Function (Firestore Security Rules
      // block direct client writes to progression.globalXP/globalLevel).
      if (typeof window !== 'undefined') {
        const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
        const userId = useUserStore.getState().profile?.id;
        if (userId) {
          await guardianAward({ xpDelta: xpEarned, source: 'workout:strength' });
          // Record activity so daysActive / lemurStage update (idempotent per day)
          get().recordActivity(userId).catch((e) =>
            console.warn('[ProgressionStore] recordActivity failed (non-critical):', e),
          );
        }
      }

      console.log(
        `[ProgressionStore] +${xpEarned} XP → total ${newTotalXP}, Level ${newLevel}` +
        (leveledUp ? ` (LEVEL UP from ${previousLevel}!)` : ''),
      );

      return { xpEarned, newLevel, leveledUp };
    } catch (error) {
      console.error('[ProgressionStore] Error awarding strength XP:', error);
      return { xpEarned: 0, newLevel: previousLevel, leveledUp: false };
    }
  },

  /**
   * Award global XP after a running or walking workout.
   * Mirrors awardStrengthXP — uses atomic Firestore increment for globalXP.
   *
   * Formula: round((Minutes × 3 + Km × 10) × StreakMultiplier)
   */
  awardRunningXP: async (params: RunningWorkoutXPParams) => {
    const state = get();
    const previousLevel = state.globalLevel;

    try {
      const xpEarned = calculateRunningWorkoutXP(params);
      const newTotalXP = state.globalXP + xpEarned;
      const newLevel = calculateLevelFromXP(newTotalXP, []);
      const leveledUp = newLevel > previousLevel;

      // Optimistic local update
      set({ globalXP: newTotalXP, globalLevel: newLevel });

      // Persist via Guardian (rules block direct client writes)
      if (typeof window !== 'undefined') {
        const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
        const userId = useUserStore.getState().profile?.id;
        if (userId) {
          await guardianAward({ xpDelta: xpEarned, source: `workout:${params.activityType ?? 'running'}` });
          // Record activity so daysActive / lemurStage update (idempotent per day)
          get().recordActivity(userId).catch((e) =>
            console.warn('[ProgressionStore] recordActivity failed (non-critical):', e),
          );
        }
      }

      console.log(
        `[ProgressionStore] +${xpEarned} XP (running) → total ${newTotalXP}, Level ${newLevel}` +
        (leveledUp ? ` (LEVEL UP from ${previousLevel}!)` : ''),
      );

      return { xpEarned, newLevel, leveledUp };
    } catch (error) {
      console.error('[ProgressionStore] Error awarding running XP:', error);
      return { xpEarned: 0, newLevel: previousLevel, leveledUp: false };
    }
  },

  /**
   * Award global XP after a commute (A-to-B) session.
   *
   * Mirrors awardRunningXP exactly — same optimistic-then-Guardian
   * pattern, same recordActivity follow-up — but uses the slimmer
   * `calculateCommuteXP` formula and tags the Guardian audit event
   * with `source: 'workout:commute'` so admin tooling can split out
   * commute XP when reporting on player progression.
   *
   * No "green route" or variant-based bonuses — the user's product
   * brief explicitly removed greenery scoring; commute reward is
   * purely a function of duration + distance + streak.
   */
  awardCommuteXP: async (params: CommuteWorkoutXPParams) => {
    const state = get();
    const previousLevel = state.globalLevel;

    try {
      const xpEarned = calculateCommuteXP(params);
      const newTotalXP = state.globalXP + xpEarned;
      const newLevel = calculateLevelFromXP(newTotalXP, []);
      const leveledUp = newLevel > previousLevel;

      // Optimistic local update
      set({ globalXP: newTotalXP, globalLevel: newLevel });

      if (typeof window !== 'undefined') {
        const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
        const userId = useUserStore.getState().profile?.id;
        if (userId) {
          await guardianAward({ xpDelta: xpEarned, source: 'workout:commute' });
          // Record activity so daysActive / lemurStage update (idempotent per day).
          // A daily commute SHOULD count toward the streak — that's the whole
          // gamification hook for this feature.
          get().recordActivity(userId).catch((e) =>
            console.warn('[ProgressionStore] recordActivity failed (non-critical):', e),
          );
        }
      }

      console.log(
        `[ProgressionStore] +${xpEarned} XP (commute) → total ${newTotalXP}, Level ${newLevel}` +
        (leveledUp ? ` (LEVEL UP from ${previousLevel}!)` : ''),
      );

      return { xpEarned, newLevel, leveledUp };
    } catch (error) {
      console.error('[ProgressionStore] Error awarding commute XP:', error);
      return { xpEarned: 0, newLevel: previousLevel, leveledUp: false };
    }
  },

  /**
   * Award a flat one-time XP bonus (e.g. for completing a LevelGoal from a program).
   * Uses the same atomic Firestore increment pattern as awardStrengthXP.
   */
  awardBonusXP: async (xp: number, reason = 'bonus') => {
    const state = get();
    const previousLevel = state.globalLevel;
    const xpEarned = Math.max(0, Math.round(xp));
    if (xpEarned === 0) return { xpEarned: 0, newLevel: previousLevel, leveledUp: false };

    try {
      const newTotalXP = state.globalXP + xpEarned;
      const newLevel = calculateLevelFromXP(newTotalXP, []);
      const leveledUp = newLevel > previousLevel;

      set({ globalXP: newTotalXP, globalLevel: newLevel });

      if (typeof window !== 'undefined') {
        const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
        const userId = useUserStore.getState().profile?.id;
        if (userId) {
          await guardianAward({ xpDelta: xpEarned, source: `bonus:${reason}` });
        }
      }

      console.log(
        `[ProgressionStore] +${xpEarned} XP (${reason}) → total ${newTotalXP}, Level ${newLevel}` +
        (leveledUp ? ` (LEVEL UP from ${previousLevel}!)` : ''),
      );

      return { xpEarned, newLevel, leveledUp };
    } catch (error) {
      console.error('[ProgressionStore] Error awarding bonus XP:', error);
      return { xpEarned: 0, newLevel: previousLevel, leveledUp: false };
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
   * Update domain progress directly (for UI sync after workout completion)
   */
  updateDomainProgress: (domain: string, level: number, percent: number) => {
    set((state) => ({
      domainProgress: {
        ...state.domainProgress,
        [domain]: { level, percent },
      },
    }));
  },

  /**
   * Start a workout session - record baseline progress
   * Call this when workout begins to capture starting state
   * 
   * @param domain - The program/domain ID
   * @param baseGain - The base session gain for the current level (%)
   * @param requiredSets - Total sets required for 100% gain
   */
  startSession: (domain: string, baseGain: number, requiredSets: number) => {
    set((state) => {
      const currentDomain = state.domainProgress[domain] || { level: 1, percent: 0 };
      
      return {
        sessionProgress: {
          ...state.sessionProgress,
          [domain]: {
            baselinePercent: currentDomain.percent,
            baselineLevel: currentDomain.level,
            currentSets: 0,
            requiredSets,
            baseGain,
          },
        },
      };
    });
  },

  /**
   * Update session sets and recalculate domain progress in real-time
   * Call this after each set completion for immediate visual feedback
   * 
   * @param domain - The program/domain ID
   * @param currentSets - Total sets completed so far in this session
   */
  updateSessionSets: (domain: string, currentSets: number) => {
    set((state) => {
      const session = state.sessionProgress[domain];
      if (!session) {
        console.warn(`[ProgressionStore] No session found for domain ${domain}`);
        return state;
      }
      
      // Pay-as-you-go: strictly linear — (Completed Sets / Target Sets) × baseGain (minSets ignored)
      const volumeRatio = Math.min(1, currentSets / session.requiredSets);
      const sessionGain = volumeRatio * session.baseGain;
      
      // Calculate new progress from baseline
      let newPercent = session.baselinePercent + sessionGain;
      let newLevel = session.baselineLevel;
      
      // Handle level up
      if (newPercent >= 100) {
        newLevel = session.baselineLevel + 1;
        newPercent = newPercent - 100;
      }
      
      return {
        sessionProgress: {
          ...state.sessionProgress,
          [domain]: {
            ...session,
            currentSets,
          },
        },
        domainProgress: {
          ...state.domainProgress,
          [domain]: {
            level: newLevel,
            percent: Math.round(newPercent * 10) / 10, // Round to 1 decimal
          },
        },
      };
    });
  },

  /**
   * End a workout session - clear session tracking state
   * The final progress has already been applied to domainProgress
   * 
   * @param domain - The program/domain ID
   */
  endSession: (domain: string) => {
    set((state) => {
      const { [domain]: removed, ...remainingSessions } = state.sessionProgress;
      return {
        sessionProgress: remainingSessions,
      };
    });
  },

  /**
   * Reset progression state (for logout)
   * Also tears down the real-time Firestore listener.
   */
  reset: () => {
    _progressionUnsubscribe.forEach((unsub) => unsub());
    _progressionUnsubscribe.clear();
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
