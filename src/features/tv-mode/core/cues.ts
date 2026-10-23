export type TvCue = 'short' | 'long' | null;

/**
 * The countdown cue for a running down-clock that just moved from `prevSec` to `sec` whole seconds left:
 * short beeps at 3, 2, 1 and a long one at 0 — the same rhythm the phone player uses. Pure.
 */
export function cueForSecond(prevSec: number | null, sec: number): TvCue {
  if (prevSec === null || prevSec === sec) return null;
  if (sec === 0) return prevSec > 0 ? 'long' : null;
  return sec >= 1 && sec <= 3 && prevSec > sec ? 'short' : null;
}

/** The whole second a down-clock counts cues on: displayed seconds while time is left, 0 only at the real end. */
export function cueSecond(clockMs: number): number {
  if (clockMs <= 0) return 0;
  return Math.max(1, Math.floor(clockMs / 1000));
}
