import { create } from 'zustand';
import { OnboardingData, OnboardingStepId } from '../types';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';

interface OnboardingStore {
  // State
  currentStep: OnboardingStepId;
  data: Partial<OnboardingData>;
  coins: number;
  completedStepsRewards: string[]; // Track which step rewards have been claimed

  // Actions
  setStep: (step: OnboardingStepId) => void;
  updateData: (data: Partial<OnboardingData>) => void;
  addCoins: (amount: number) => void;
  hasClaimedReward: (stepRewardId: string) => boolean;
  claimReward: (stepRewardId: string, coinAmount: number) => boolean; // Returns true if reward was claimed (first time)
  reset: () => void;
}

const initialState = {
  currentStep: 'LOCATION' as OnboardingStepId,
  data: {} as Partial<OnboardingData>,
  coins: 0,
  completedStepsRewards: [] as string[],
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
  
  addCoins: (amount) => set((state) => ({
    coins: state.coins + amount
  })),
  
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
    
    // Claim reward (first time)
    set({
      completedStepsRewards: [...state.completedStepsRewards, stepRewardId],
      coins: state.coins + coinAmount
    });
    
    return true; // Reward claimed successfully
  },
  
  reset: () => set(initialState),
}));
