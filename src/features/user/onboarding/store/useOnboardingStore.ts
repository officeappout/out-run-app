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

  // Actions
  setStep: (step: OnboardingStepId) => void;
  updateData: (data: Partial<OnboardingData>) => void;
  addCoins: (amount: number) => void;
  hasClaimedReward: (stepRewardId: string) => boolean;
  claimReward: (stepRewardId: string, coinAmount: number) => boolean; // Returns true if reward was claimed (first time)
  setMajorRoadmapStep: (step: number) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 'PERSONA' as OnboardingStepId, // Start at PERSONA for Phase 2
  data: {} as Partial<OnboardingData>,
  coins: 0,
  completedStepsRewards: [] as string[],
  majorRoadmapStep: 0, // Start at step 0 (אבחון ודירוג יכולות)
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  ...initialState,

  setStep: (step) => {
    set({ currentStep: step });
    
    // Sync to Firestore in background (don't await - non-blocking)
    const state = get();
    const currentData = state.data;
    const coins = state.coins;
    syncOnboardingToFirestore(step, { ...currentData, onboardingCoins: coins }).catch((error) => {
      console.error('[OnboardingStore] Error syncing step to Firestore:', error);
    });
  },
  
  updateData: (updates) => {
    const state = get();
    const newData = { ...state.data, ...updates };
    set({ data: newData });
    
    // Sync to Firestore when data is updated
    syncOnboardingToFirestore(state.currentStep, { ...newData, onboardingCoins: state.coins }).catch((error) => {
      console.error('[OnboardingStore] Error syncing data to Firestore:', error);
    });
  },
  
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
}));
