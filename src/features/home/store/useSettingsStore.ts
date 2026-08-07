'use client';

import { create } from 'zustand';

export interface SettingsData {
  inactivityAlerts: boolean;
  achievementAlerts: boolean;
  tipsAlerts: boolean;
  units: 'km' | 'miles';
  healthBridgeEnabled: boolean;
  /** Mirrors PREF_KEY_ASKED — combined with healthBridgeEnabled, derives not-asked/asked-denied/granted. */
  healthPermissionAsked: boolean;
  /** Master push switch — mirrors `users/{uid}.settings.pushEnabled` */
  pushEnabled: boolean;
  /** Per-channel chat toggle — mirrors `users/{uid}.settings.notificationPrefs.chat` */
  chatNotifEnabled: boolean;
  /** Per-channel toggles for new channels — mirrors notificationPrefs.{channel} */
  progressionNotif: boolean;
  socialNotif: boolean;
  communityNotif: boolean;
  retentionNotif: boolean;
  trainingReminderNotif: boolean;
  encouragementNotif: boolean;
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
  healthPermissionAsked: false,
  pushEnabled: true,
  chatNotifEnabled: true,
  progressionNotif: true,
  socialNotif: true,
  communityNotif: true,
  retentionNotif: true,
  trainingReminderNotif: true,
  encouragementNotif: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  isLoaded: false,
  hydrate: (data) => set({ ...data, isLoaded: true }),
  patch: (data) => set(data),
  reset: () => set({ ...DEFAULTS, isLoaded: false }),
}));
