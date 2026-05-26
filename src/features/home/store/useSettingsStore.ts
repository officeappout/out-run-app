'use client';

import { create } from 'zustand';

export interface SettingsData {
  inactivityAlerts: boolean;
  achievementAlerts: boolean;
  tipsAlerts: boolean;
  units: 'km' | 'miles';
  healthBridgeEnabled: boolean;
}

interface SettingsState extends SettingsData {
  /** True after the first hydrate() call completes (so UI doesn't flash defaults) */
  isLoaded: boolean;
  /** Load settings from Firestore / Capacitor on modal open */
  hydrate: (data: Partial<SettingsData>) => void;
  /** Optimistically update one or more fields (before the debounced Firestore write) */
  patch: (data: Partial<SettingsData>) => void;
  /** Reset to defaults when modal closes (prevents stale state on next open) */
  reset: () => void;
}

const DEFAULTS: SettingsData = {
  inactivityAlerts: true,
  achievementAlerts: true,
  tipsAlerts: true,
  units: 'km',
  healthBridgeEnabled: false,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  isLoaded: false,
  hydrate: (data) => set({ ...data, isLoaded: true }),
  patch: (data) => set(data),
  reset: () => set({ ...DEFAULTS, isLoaded: false }),
}));
