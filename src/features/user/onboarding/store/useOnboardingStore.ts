import { create } from 'zustand';
import { OnboardingData, OnboardingStepId } from '../types';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface OnboardingStore {
  // State
  currentStep: OnboardingStepId;
  data: Partial<OnboardingData>;
  coins: number;
  completedStepsRewards: string[]; // Track which step rewards have been claimed

  // Major roadmap step tracking (0=אבחון, 1=התאמה, 2=שריון)
  majorRoadmapStep: number;

  // Set when the debounced Firestore sync below fails — surfaced by a
  // global toast listener (see OnboardingSyncErrorToast in ClientLayout).
  // Cleared automatically on the next successful sync, or manually via
  // clearSyncError() once shown.
  syncError: string | null;

  // Actions
  setStep: (step: OnboardingStepId) => void;
  updateData: (data: Partial<OnboardingData>) => void;
  addCoins: (amount: number) => void;
  hasClaimedReward: (stepRewardId: string) => boolean;
  claimReward: (stepRewardId: string, coinAmount: number) => boolean; // Returns true if reward was claimed (first time)
  setMajorRoadmapStep: (step: number) => void;
  // Fires any pending debounced sync immediately, bypassing the timer.
  // Call this right before navigating away from a step whose data must not
  // be lost to an in-flight debounce getting cut off by unmount (e.g. the
  // LOCATION step's "confirm" action). No-op (resolves immediately) if
  // nothing is pending.
  flushPendingSync: () => Promise<void>;
  clearSyncError: () => void;
  reset: () => void;
}

const initialState = {
  currentStep: 'PERSONA' as OnboardingStepId, // Start at PERSONA for Phase 2
  data: {} as Partial<OnboardingData>,
  coins: 0,
  completedStepsRewards: [] as string[],
  majorRoadmapStep: 0, // Start at step 0 (אבחון ודירוג יכולות)
  syncError: null as string | null,
};

const SYNC_DEBOUNCE_MS = 400;
const SYNC_ERROR_MESSAGE = 'לא הצלחנו לשמור את הבחירה שלך. בדקו חיבור לאינטרנט ונסו שוב.';

// Module-level (not store state) — this is dispatch plumbing, not something
// any component needs to render off of. Only its EFFECT on `syncError`
// state is reactive. A single shared timer means every updateData()/setStep()
// call coalesces into one write reflecting the latest state, instead of each
// call racing its own independent Firestore write (the root cause of a real
// production bug: rapid re-picks in the onboarding LOCATION step could each
// fire their own sync, resolve out of order, and leave core.authorityId /
// core.neighborhoodId pointing at unrelated, mismatched cities).
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncGeneration = 0;

export const useOnboardingStore = create<OnboardingStore>((set, get) => {
  // Only the generation that's current WHEN THIS RESOLVES is allowed to
  // write syncError — if a newer cycle started while this one was still in
  // flight, this one's outcome is stale and must not clobber the newer
  // cycle's (still-pending) result.
  const dispatchSync = (): Promise<void> => {
    syncDebounceTimer = null;
    const myGeneration = syncGeneration;
    const state = get();
    return syncOnboardingToFirestore(state.currentStep, { ...state.data, onboardingCoins: state.coins })
      .then((ok) => {
        if (myGeneration !== syncGeneration) return;
        set({ syncError: ok ? null : SYNC_ERROR_MESSAGE });
      })
      .catch((error) => {
        console.error('[OnboardingStore] Error syncing to Firestore:', error);
        if (myGeneration !== syncGeneration) return;
        set({ syncError: SYNC_ERROR_MESSAGE });
      });
  };

  const scheduleSync = () => {
    syncGeneration += 1;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(dispatchSync, SYNC_DEBOUNCE_MS);
  };

  return {
    ...initialState,

    setStep: (step) => {
      set({ currentStep: step });
      scheduleSync();
    },

    updateData: (updates) => {
      const state = get();
      const newData = { ...state.data, ...updates };
      set({ data: newData });
      scheduleSync();
    },

    flushPendingSync: () => {
      if (!syncDebounceTimer) return Promise.resolve();
      clearTimeout(syncDebounceTimer);
      return dispatchSync();
    },

    clearSyncError: () => set({ syncError: null }),

    // COIN_SYSTEM_PAUSED: Re-enable in April
    addCoins: (amount) => {
      if (!IS_COIN_SYSTEM_ENABLED) return; // Don't add coins when system is disabled
      set((state) => ({
        coins: state.coins + amount
      }));
    },

    hasClaimedReward: (stepRewardId) => {
      const state = get();
      return state.completedStepsRewards.includes(stepRewardId);
    },

    claimReward: (stepRewardId, coinAmount) => {
      const state = get();
      // Check if reward was already claimed
      if (state.completedStepsRewards.includes(stepRewardId)) {
        return false; // Reward already claimed
      }

      // COIN_SYSTEM_PAUSED: Re-enable in April
      // Still track claimed rewards (for state), but don't add coins when disabled
      set({
        completedStepsRewards: [...state.completedStepsRewards, stepRewardId],
        coins: IS_COIN_SYSTEM_ENABLED ? state.coins + coinAmount : state.coins
      });

      return true; // Reward claimed successfully (even if coins weren't added)
    },

    setMajorRoadmapStep: (step) => {
      set({ majorRoadmapStep: step });
      // Also persist to sessionStorage for page refreshes
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('onboarding_major_step', String(step));
      }
    },

    reset: () => set(initialState),
  };
});
