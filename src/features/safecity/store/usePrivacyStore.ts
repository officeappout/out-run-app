'use client';

/**
 * Privacy Store — Controls map visibility mode.
 *
 * Three modes:
 *   Ghost          — User is invisible on the map. No presence broadcast.
 *   Squad          — Only direct Partners (following) can see the user.
 *   VerifiedGlobal — All Verified users in the same age group can see the user.
 *
 * Default: `verified_global`.
 *   The partner finder + map markers query `presence` with
 *   `where('mode', '==', 'verified_global')` to satisfy the Firestore
 *   read rule on /presence/{uid}. If the default were `'squad'`, every
 *   new sign-up would be invisible to strangers AND would see no
 *   strangers — i.e. the partner finder would render empty out of the
 *   box even though everything else was wired up correctly. Users who
 *   want followers-only or full invisibility can downgrade in Settings;
 *   the choice persists per browser via localStorage.
 *
 * Persists to localStorage so the choice survives refreshes.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PrivacyMode = 'ghost' | 'squad' | 'verified_global';

interface PrivacyState {
  mode: PrivacyMode;
  setMode: (mode: PrivacyMode) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      mode: 'verified_global',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'out-privacy-mode',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
