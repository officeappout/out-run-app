import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserFullProfile } from '@/types/user-profile';

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
  setHasHydrated: (state: boolean) => void;
}

// ==========================================
// Storage מותאם אישית לטיפול ב-Date objects
// ==========================================
const customStorage = {
  getItem: (name: string): string | null => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    
    try {
      const parsed = JSON.parse(str);
      const state = parsed?.state;
      
      if (!state?.profile) return str;
      
      // המרת ISO strings חזרה ל-Date objects
      if (state.profile.core?.birthDate) {
        state.profile.core.birthDate = new Date(state.profile.core.birthDate);
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
        return profile !== null && profile?.core?.name !== '';
      },

      // איפוס פרופיל (לצורך logout או reset)
      resetProfile: () => {
        set({ profile: null });
      },
    }),
    {
      name: 'out-user-storage', // שם המפתח ב-localStorage
      storage: createJSONStorage(() => customStorage),
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
