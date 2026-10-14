/**
 * player-audio-mute — one session-wide mute switch for the strength player's audio cues
 * (countdown beeps today; voice cues later should read the same flag).
 *
 * "For the rest of the session": the flag lives in a module-level zustand store (survives
 * StrengthRunner unmount/remount between hybrid stations) and is mirrored to sessionStorage
 * (survives a reload, cleared when the app/tab session ends). Storage access is guarded —
 * private mode / blocked storage just means the flag doesn't outlive the JS runtime.
 *
 * Plain .ts (no JSX) so it's unit-testable under this repo's node-only vitest.
 */
import { create } from 'zustand';

export const PLAYER_AUDIO_MUTED_KEY = 'out_player_audio_muted';

function readStored(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PLAYER_AUDIO_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(muted: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (muted) sessionStorage.setItem(PLAYER_AUDIO_MUTED_KEY, '1');
    else sessionStorage.removeItem(PLAYER_AUDIO_MUTED_KEY);
  } catch {
    /* storage unavailable — in-memory flag still applies for this runtime */
  }
}

interface PlayerAudioMuteStore {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
}

export const usePlayerAudioMute = create<PlayerAudioMuteStore>((set, get) => ({
  muted: readStored(),
  setMuted: (muted) => {
    writeStored(muted);
    set({ muted });
  },
  toggleMuted: () => get().setMuted(!get().muted),
}));

/** Synchronous read for non-React call sites (beep helpers inside timers). */
export function isPlayerAudioMuted(): boolean {
  return usePlayerAudioMute.getState().muted;
}
