/**
 * Zustand store that holds the global PaceMapConfig.
 *
 * On first load, uses the bundled DEFAULT_PACE_MAP_CONFIG.
 * When `loadFromFirestore()` is called, fetches the live version from
 * `config/paceMapConfig` and replaces the local copy.
 *
 * This store is intentionally NOT persisted to localStorage — the config
 * is small and re-fetching on cold start guarantees freshness.
 */

import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PaceMapConfig } from '../types/running.types';
import { DEFAULT_PACE_MAP_CONFIG } from '../config/pace-map-config';

interface RunningConfigState {
  config: PaceMapConfig;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  loadFromFirestore: () => Promise<void>;
  reset: () => void;
}

export const useRunningConfigStore = create<RunningConfigState>((set, get) => ({
  config: DEFAULT_PACE_MAP_CONFIG,
  isLoaded: false,
  isLoading: false,
  error: null,

  loadFromFirestore: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });

    try {
      const configRef = doc(db, 'config', 'paceMapConfig');
      const snap = await getDoc(configRef);

      if (snap.exists()) {
        const remote = snap.data() as PaceMapConfig;
        set({ config: remote, isLoaded: true, isLoading: false });
      } else {
        set({ config: DEFAULT_PACE_MAP_CONFIG, isLoaded: true, isLoading: false });
      }
    } catch (err) {
      console.error('[RunningConfigStore] Failed to load config:', err);
      set({
        config: DEFAULT_PACE_MAP_CONFIG,
        isLoaded: true,
        isLoading: false,
        error: (err as Error).message,
      });
    }
  },

  reset: () => {
    set({
      config: DEFAULT_PACE_MAP_CONFIG,
      isLoaded: false,
      isLoading: false,
      error: null,
    });
  },
}));
