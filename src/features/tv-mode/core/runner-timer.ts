import type { TvTimer } from './types';

/** A running clock read this long after its base is `baseMs ∓ since`. */
export function ageTimer(timer: TvTimer, sinceMs: number): TvTimer {
  if (timer.dir === 'none' || !timer.running || sinceMs <= 0) return timer;
  const baseMs = timer.dir === 'down' ? Math.max(0, timer.baseMs - sinceMs) : timer.baseMs + sinceMs;
  return { ...timer, baseMs };
}

/** How far a clock may drift from the player's own before the mirror re-stamps it (a rest second, a lag). */
export const TIMER_DRIFT_TOLERANCE_MS = 1500;

/**
 * Is `desired` (true now) the same clock as `current` (true `sinceMs` ago)? Same direction / run state /
 * length, and the same reading within the tolerance — so a ticking rest does not rewrite the doc every
 * second, but "+15 s" or a restart does.
 */
export function timersEquivalent(current: TvTimer, sinceMs: number, desired: TvTimer): boolean {
  if (current.dir !== desired.dir || current.running !== desired.running) return false;
  if (current.dir === 'none') return true;
  if (current.totalMs !== desired.totalMs) return false;
  return Math.abs(ageTimer(current, sinceMs).baseMs - desired.baseMs) <= TIMER_DRIFT_TOLERANCE_MS;
}
