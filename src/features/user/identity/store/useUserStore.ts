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
//
// Dual-write strategy:
//   • localStorage  — primary, synchronous, the source of truth for the
//                     current session. All Date serialization logic
//                     happens here exactly as before.
//   • @capacitor/preferences (native only)
//                   — durable backup that survives WKWebView storage
//                     eviction on iOS hard close. On `getItem` we fall
//                     back to Preferences when localStorage is empty,
//                     and re-prime localStorage with the recovered value
//                     so subsequent sync reads hit the fast cache.
//                     On `setItem`/`removeItem` we mirror asynchronously
//                     (fire-and-forget).
// ==========================================
const BACKUP_KEY_SUFFIX = '_backup';

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Restore Date objects from their serialized form in a parsed persist payload. */
function reviveDates(state: any): any {
  if (!state?.profile) return state;

  if (state.profile.core?.birthDate) {
    const raw = state.profile.core.birthDate;
    if (typeof raw === 'object' && raw !== null && typeof raw.seconds === 'number') {
      state.profile.core.birthDate = new Date(raw.seconds * 1000);
    } else {
      const d = new Date(raw);
      state.profile.core.birthDate = isNaN(d.getTime()) ? undefined : d;
    }
  }

  if (state.profile.progression?.activePrograms) {
    state.profile.progression.activePrograms =
      state.profile.progression.activePrograms.map((program: any) => ({
        ...program,
        startDate: new Date(program.startDate),
      }));
  }

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

  return state;
}

/** Apply the Date-revival pass and re-serialize. Returns the original string on failure. */
function reviveStored(str: string): string {
  try {
    const parsed = JSON.parse(str);
    const state = reviveDates(parsed?.state);
    if (!state) return str;
    return JSON.stringify({ state, version: parsed.version });
  } catch {
    return str;
  }
}

const customStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    const str = localStorage.getItem(name);
    if (str) return reviveStored(str);

    // Cache miss — let Zustand initialize empty for now, and kick off a
    // best-effort restore from @capacitor/preferences. When it returns
    // we re-prime localStorage and trigger a manual rehydrate so the
    // profile reappears within a few hundred ms on cold launch.
    if (isNativePlatform()) {
      void (async () => {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          const { value } = await Preferences.get({ key: name + BACKUP_KEY_SUFFIX });
          if (!value) return;
          try { localStorage.setItem(name, value); } catch { /* quota */ }
          // Re-hydrate Zustand so the freshly recovered profile reaches
          // the UI without a full reload. The hook is loaded lazily to
          // avoid a circular dependency through this module.
          try {
            const mod = await import('./useUserStore');
            await (mod.useUserStore as any).persist?.rehydrate?.();
          } catch {
            /* hook missing in test/SSR — non-fatal */
          }
        } catch {
          /* plugin / I/O failure */
        }
      })();
    }
    return null;
  },

  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    let serialized = value;
    try {
      const parsed = JSON.parse(value);
      const state = parsed?.state;
      if (state?.profile) {
        const serializedState = JSON.parse(
          JSON.stringify(state, (_k, val) =>
            val instanceof Date ? val.toISOString() : val,
          ),
        );
        serialized = JSON.stringify({ state: serializedState, version: parsed.version });
      }
    } catch {
      /* keep original value */
    }
    try { localStorage.setItem(name, serialized); } catch { /* quota */ }

    if (isNativePlatform()) {
      // Fire-and-forget mirror to Preferences. Profile JSON is ~2-5 KB
      // typically — well within NSUserDefaults' soft limits.
      void import('@capacitor/preferences')
        .then(({ Preferences }) =>
          Preferences.set({ key: name + BACKUP_KEY_SUFFIX, value: serialized }),
        )
        .catch(() => { /* non-fatal */ });
    }
  },

  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(name); } catch { /* quota */ }

    if (isNativePlatform()) {
      void import('@capacitor/preferences')
        .then(({ Preferences }) =>
          Preferences.remove({ key: name + BACKUP_KEY_SUFFIX }),
        )
        .catch(() => { /* non-fatal */ });
    }
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

      initializeProfile: (profile: UserFullProfile) => {
        const firebaseUid = auth.currentUser?.uid;
        if (firebaseUid && profile.id !== firebaseUid) {
          profile = { ...profile, id: firebaseUid };
        }
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
        if (state) {
          state.setHasHydrated(true);

          const profile = state.profile;
          const firebaseUid = auth.currentUser?.uid;
          if (profile && firebaseUid && profile.id !== firebaseUid) {
            console.log(`[useUserStore] Correcting stale profile.id: "${profile.id}" → "${firebaseUid}"`);
            useUserStore.setState({ profile: { ...profile, id: firebaseUid } });
          }
        }
      },
    }
  )
);
