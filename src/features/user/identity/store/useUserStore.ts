import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserFullProfile, AccessTier } from '../../core/types/user.types';
import { auth } from '@/lib/firebase';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { getUserAccessLevel, isUserVerified } from '../services/access-control.service';

// ==========================================
// State Interface
// ==========================================
interface UserState {
  // הפרופיל המלא של המשתמש
  profile: UserFullProfile | null;

  // מצב טעינה מה-localStorage
  _hasHydrated: boolean;

  // פעולות (Actions)
  initializeProfile: (profile: UserFullProfile) => void;
  updateProfile: (updates: Partial<UserFullProfile>) => void;
  hasCompletedOnboarding: () => boolean;
  resetProfile: () => void;
  refreshProfile: () => Promise<void>;
  setHasHydrated: (state: boolean) => void;

  // Access Control (Computed)
  getAccessLevel: () => AccessTier;
  getIsVerified: () => boolean;

  // Viral Gate: social features unlock at 1 referral (or admin/dev bypass)
  getSocialUnlocked: () => boolean;
}

// ==========================================
// Storage מותאם אישית לטיפול ב-Date objects
// ==========================================
const customStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    const str = localStorage.getItem(name);
    if (!str) return null;
    
    try {
      const parsed = JSON.parse(str);
      const state = parsed?.state;
      
      if (!state?.profile) return str;
      
      // המרת birthDate חזרה ל-Date — handles ISO string, serialized Timestamp { seconds, nanoseconds }, etc.
      if (state.profile.core?.birthDate) {
        const raw = state.profile.core.birthDate;
        if (typeof raw === 'object' && raw !== null && typeof raw.seconds === 'number') {
          state.profile.core.birthDate = new Date(raw.seconds * 1000);
        } else {
          const d = new Date(raw);
          state.profile.core.birthDate = isNaN(d.getTime()) ? undefined : d;
        }
      }
      
      // המרת תאריכים ב-activePrograms
      if (state.profile.progression?.activePrograms) {
        state.profile.progression.activePrograms =
          state.profile.progression.activePrograms.map((program: any) => ({
            ...program,
            startDate: new Date(program.startDate),
          }));
      }
      
      // המרת תאריכים ב-running profile
      if (state.profile.running?.activeProgram?.startDate) {
        state.profile.running.activeProgram.startDate = new Date(
          state.profile.running.activeProgram.startDate
        );
      }
      
      if (state.profile.running?.paceProfile?.qualityWorkoutsHistory) {
        state.profile.running.paceProfile.qualityWorkoutsHistory =
          state.profile.running.paceProfile.qualityWorkoutsHistory.map(
            (workout: any) => ({
              ...workout,
              date: new Date(workout.date),
            })
          );
      }
      
      return JSON.stringify({ state, version: parsed.version });
    } catch {
      return str;
    }
  },
  
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(value);
      const state = parsed?.state;
      
      if (state?.profile) {
        // המרת Date objects ל-ISO strings לפני שמירה
        const serializedState = JSON.parse(
          JSON.stringify(state, (key, val) => {
            if (val instanceof Date) {
              return val.toISOString();
            }
            return val;
          })
        );
        
        localStorage.setItem(
          name,
          JSON.stringify({ state: serializedState, version: parsed.version })
        );
      } else {
        localStorage.setItem(name, value);
      }
    } catch {
      localStorage.setItem(name, value);
    }
  },
  
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
  },
};

// ==========================================
// User Store עם Zustand + Persist (localStorage)
// ==========================================
export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // ערך התחלתי
      profile: null,
      _hasHydrated: false,

      // אתחול פרופיל (מהשירות onboarding)
      initializeProfile: (profile: UserFullProfile) => {
        // שמירה ב-localStorage דרך persist middleware
        set({ profile, _hasHydrated: true });
      },

      // עדכון מצב hydration
      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      // עדכון חלקי של הפרופיל
      updateProfile: (updates: Partial<UserFullProfile>) => {
        const currentProfile = get().profile;
        if (!currentProfile) {
          console.warn('Cannot update profile: no profile exists');
          return;
        }
        set({
          profile: {
            ...currentProfile,
            ...updates,
            // עדכון רקיקי (nested) - אם יש עדכון ל-core, progression וכו'
            ...(updates.core && {
              core: { ...currentProfile.core, ...updates.core },
            }),
            ...(updates.progression && {
              progression: {
                ...currentProfile.progression,
                ...updates.progression,
              },
            }),
            ...(updates.equipment && {
              equipment: { ...currentProfile.equipment, ...updates.equipment },
            }),
            ...(updates.lifestyle && {
              lifestyle: {
                ...currentProfile.lifestyle,
                ...updates.lifestyle,
              },
            }),
            ...(updates.health && {
              health: { ...currentProfile.health, ...updates.health },
            }),
            ...(updates.running && {
              running: { ...currentProfile.running, ...updates.running },
            }),
          },
        });
      },

      // בדיקה אם המשתמש השלים Onboarding
      hasCompletedOnboarding: () => {
        const profile = get().profile;
        if (!profile) return false;
        
        // User completed onboarding if:
        // 1. They have schedule days set (full completion), OR
        // 2. Their status is PENDING_LIFESTYLE (completed Phase 1, bridge will show), OR
        // 3. Their status is COMPLETED
        const hasSchedule = !!(
          profile.lifestyle?.scheduleDays &&
          profile.lifestyle.scheduleDays.length > 0
        );
        const status = (profile as any)?.onboardingStatus;
        const isPendingLifestyle = status === 'PENDING_LIFESTYLE';
        const isCompleted = status === 'COMPLETED';
        
        return hasSchedule || isPendingLifestyle || isCompleted;
      },

      // איפוס פרופיל (לצורך logout או reset)
      resetProfile: () => {
        set({ profile: null });
      },

      // רענון פרופיל מה-Firestore (כדי למשוך scheduleDays ועוד שדות מעודכנים)
      refreshProfile: async () => {
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) {
            return;
          }
          const freshProfile = await getUserFromFirestore(currentUser.uid);
          if (freshProfile) {
            set({ profile: freshProfile });
          }
        } catch (error) {
          console.error('[useUserStore] Error refreshing profile from Firestore:', error);
        }
      },

      // --- Access Control Getters ---
      getAccessLevel: (): AccessTier => {
        return getUserAccessLevel(get().profile);
      },

      getIsVerified: (): boolean => {
        return isUserVerified(get().profile);
      },

      getSocialUnlocked: (): boolean => {
        const p = get().profile;
        if (!p) return false;
        // Dev bypass disabled for testing — uncomment to re-enable:
        // if (process.env.NODE_ENV === 'development') return true;
        if (p.core?.isSuperAdmin) return true;
        return (p.core?.referralCount ?? 0) >= 1;
      },
    }),
    {
      name: 'out-user-storage', // שם המפתח ב-localStorage
      storage: createJSONStorage(() => customStorage),
      skipHydration: typeof window === 'undefined', // Skip hydration during SSR
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Error rehydrating user store:', error);
          return;
        }
        // לאחר טעינת הנתונים מה-localStorage
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
