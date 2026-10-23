/**
 * card-clock — the isometric timer card's own clock, reported to TV mode.
 *
 * The card owns its prep / counting / overtime state, so the runner cannot read it. When TV mode is on the
 * runner hands the card `reportCardClock`; the card calls it only when its phase or pause changes (never per
 * tick) with the reading at that moment. With TV mode off nobody passes the callback and nothing runs.
 * Plain module store (zustand, like player-audio-mute), no React state in the runner.
 */
import { create } from 'zustand';

export interface CardClockReport {
  phase: 'idle' | 'preparing' | 'counting' | 'overtime';
  /** The card's own pause OR the player-level pause. */
  paused: boolean;
  elapsedSec: number;
  prepLeftSec: number;
  prepTotalSec: number;
  durationSec: number;
  /** Local ms when the numbers above were true. */
  at: number;
}

interface CardClockStore {
  report: CardClockReport | null;
  set: (r: CardClockReport | null) => void;
}

export const useCardClockStore = create<CardClockStore>((set) => ({ report: null, set: (report) => set({ report }) }));

/** Stable callback handed to ActiveExerciseView → IsometricTimerCard. */
export function reportCardClock(r: CardClockReport | null): void {
  useCardClockStore.getState().set(r);
}
