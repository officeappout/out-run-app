import type { TvRemoteControls } from '../phone/phone-store';

export interface RunnerActions {
  togglePause: () => void;
  /** "Next" in the player's own terms (finish the set / skip the rest). */
  next: () => void;
  /** Only when the player really has them. */
  prev?: () => void;
  skipExercise?: () => void;
}

/** A second tap on the same advancing button inside this window is the same press (remote double tap). */
export const REMOTE_PRESS_GUARD_MS = 600;

/**
 * The host remote's buttons mapped onto the player's actions. Buttons that move the workout forward run
 * once per press even when the tap lands twice; pause / resume always run (toggling twice is a real intent).
 * A button the player cannot honour is left out, so the remote can hide it instead of faking it.
 */
export function createRunnerControls(actions: RunnerActions, now: () => number = Date.now): TvRemoteControls {
  const lastRun = new Map<string, number>();
  const once = (key: string, fn: () => void) => () => {
    const t = now();
    const prev = lastRun.get(key);
    if (prev !== undefined && t - prev < REMOTE_PRESS_GUARD_MS) return;
    lastRun.set(key, t);
    fn();
  };
  return {
    togglePause: actions.togglePause,
    next: once('next', actions.next),
    ...(actions.prev ? { prev: once('prev', actions.prev) } : {}),
    ...(actions.skipExercise ? { skipExercise: once('skip', actions.skipExercise) } : {}),
  };
}
