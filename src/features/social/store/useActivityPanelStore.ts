'use client';

/**
 * Activity Panel Store — globally controls the ActivityPanel sheet from
 * anywhere in the app.
 *
 * Mirrors the `useChatStore` pattern: in-memory only, no persistence — opening
 * the activity panel is an explicit user action that shouldn't survive a
 * refresh.
 *
 * Named "PanelStore" (not "ActivityStore") because `src/features/activity`
 * already exposes a `useActivityStore` for daily-activity tracking + streaks.
 */

import { create } from 'zustand';

interface ActivityPanelStoreState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useActivityPanelStore = create<ActivityPanelStoreState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
