/**
 * timed-clock — active time from start/pause timestamps (pure).
 *
 * activeMs(now) = now − start − paused time. Nothing is accumulated per
 * tick, so a missed tick, a throttled timer or a whole background period
 * costs nothing: the next read recomputes the exact value.
 */
import type { TimedClock } from './timed.types';

export const IDLE_CLOCK: TimedClock = Object.freeze({
  startedAtMs: null,
  pausedAtMs: null,
  pausedTotalMs: 0,
  frozenActiveMs: null,
  endedAtMs: null,
}) as TimedClock;

export function startClock(atMs: number): TimedClock {
  return { ...IDLE_CLOCK, startedAtMs: atMs };
}

/** Active ms at wall time `nowMs` (0 before start, frozen after the end/cap). */
export function activeMsAt(clock: TimedClock, nowMs: number): number {
  if (clock.frozenActiveMs != null) return clock.frozenActiveMs;
  if (clock.startedAtMs == null) return 0;
  const ref = clock.pausedAtMs ?? nowMs;
  return Math.max(0, ref - clock.startedAtMs - clock.pausedTotalMs);
}

export function pauseClock(clock: TimedClock, atMs: number): TimedClock {
  if (clock.startedAtMs == null || clock.pausedAtMs != null || clock.frozenActiveMs != null) return clock;
  return { ...clock, pausedAtMs: atMs };
}

export function resumeClock(clock: TimedClock, atMs: number): TimedClock {
  if (clock.pausedAtMs == null) return clock;
  return { ...clock, pausedAtMs: null, pausedTotalMs: clock.pausedTotalMs + Math.max(0, atMs - clock.pausedAtMs) };
}

/**
 * Freeze the clock at `activeMs` (block end / cap). `atMs` is the wall time
 * of the event that noticed it; the wall end is back-dated to the exact
 * moment the active time reached `activeMs`.
 */
export function freezeClock(clock: TimedClock, activeMs: number, atMs: number): TimedClock {
  if (clock.frozenActiveMs != null) return clock;
  const nowActive = activeMsAt(clock, atMs);
  const overshoot = Math.max(0, nowActive - activeMs);
  const endedAtMs = (clock.pausedAtMs ?? atMs) - overshoot;
  return { ...clock, pausedAtMs: null, frozenActiveMs: Math.min(activeMs, nowActive), endedAtMs };
}
