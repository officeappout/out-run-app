'use client';

/**
 * Privacy Store — Controls map visibility mode.
 *
 * Three modes:
 *   Ghost          — User is invisible on the map. No presence broadcast.
 *   Squad          — Only direct Partners (following) can see the user.
 *   VerifiedGlobal — All Verified users in the same age group can see the user.
 *
 * Default: `ghost` (privacy-first).
 *   App Store Guideline 4.5.4 / privacy-by-default: a brand-new user must
 *   NOT be broadcast on the map until they explicitly opt in. We therefore
 *   default to `ghost` (fully hidden — no presence broadcast). Users who
 *   want to be discovered can upgrade to `squad` (followers-only) or
 *   `verified_global` (all verified users in their age group) from
 *   Settings → "נראות במפה". The choice persists per browser via
 *   localStorage AND is mirrored to Firestore (`settings.privacyMode`)
 *   by SettingsModal so it survives reinstall / new device.
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
      mode: 'ghost',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'out-privacy-mode',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
