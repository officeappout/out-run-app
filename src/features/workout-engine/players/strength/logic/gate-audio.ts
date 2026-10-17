/**
 * gate-audio — G6.1 "merged start" (flag `enable_guided_merged_start`, fail-closed).
 *
 * Guided station today: welcome "התחל" → the demo gate shows the clip looping MUTED → the user
 * hears nothing until "צפיתי, התחל" (which unmutes it as the set starts). With the flag on, the
 * welcome screen's start tap ARMS the gate audio: the tap is the user gesture, and the gate's
 * demo then opens already playing WITH SOUND (unless the session mute is on). The set itself
 * still starts only on "צפיתי, התחל" — nothing about the hold / clocks changes.
 *
 * Why a module store and not a prop: the gate is drawn inside StrengthRunner, which is not
 * touched by this change (axiom §3). HybridStationLayer (which owns the flag + the welcome tap)
 * writes it; ActiveExerciseView reads it. Flag off → the tap writes `false` → today exactly.
 *
 * Plain .ts (no JSX) so the node-only vitest covers it.
 */
import { create } from 'zustand';

interface GateAudioStore {
  /** The latest guided welcome tap happened with `enable_guided_merged_start` on. */
  armed: boolean;
  setArmed: (armed: boolean) => void;
}

export const useGateAudio = create<GateAudioStore>((set) => ({
  armed: false,
  setArmed: (armed) => set({ armed }),
}));

/**
 * Called synchronously inside the welcome screen's start tap. Always writes — so turning the
 * flag off takes effect at the very next station, even if an earlier tap armed it.
 */
export function armGateAudioOnWelcomeTap(mergedStartFlag: boolean): void {
  useGateAudio.getState().setArmed(mergedStartFlag === true);
}

/** Synchronous read for non-React call sites. */
export function isGateAudioArmed(): boolean {
  return useGateAudio.getState().armed;
}
