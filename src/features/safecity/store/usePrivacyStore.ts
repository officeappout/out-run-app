'use client';

/**
 * Privacy Store — Controls map visibility mode.
 *
 * Three modes:
 *   Ghost          — User is invisible on the map. No presence broadcast.
 *   Squad          — Only direct Partners (following) can see the user.
 *   VerifiedGlobal — All Verified users in the same age group can see the user.
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
      mode: 'squad',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'out-privacy-mode',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
