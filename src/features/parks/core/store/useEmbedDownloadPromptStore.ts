import { create } from 'zustand';

/**
 * Global "download the app" modal for /embed/map. Any write action that would
 * otherwise start a real session or require auth opens this instead of doing
 * nothing — see MapShell's guardedLogic.startActiveWorkout and
 * ParkDetailSheet's write-action buttons.
 */
interface EmbedDownloadPromptState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useEmbedDownloadPromptStore = create<EmbedDownloadPromptState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
