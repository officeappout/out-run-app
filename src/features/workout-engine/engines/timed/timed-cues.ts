/**
 * timed-cues — sound / haptic moments between two active times (pure).
 *
 * The hook remembers the active time of its previous frame and asks for
 * every cue in (from, to]. After a long gap (the app was in the background)
 * stale countdown beeps are dropped and only the latest phase change is
 * kept, so a resumed phone never fires a burst of old beeps.
 */
import { tabataTotalMs, tabataWorkStartMs } from './tabata-schedule';
import { timedTotalMs } from './timed-machine';
import type { TimedCue, TimedState } from './timed.types';

function countdownsBefore(endMs: number, secs: readonly number[]): TimedCue[] {
  return secs
    .filter((s) => s > 0 && endMs - s * 1000 >= 0)
    .map((s) => ({ type: 'countdown' as const, secondsLeft: s, atActiveMs: endMs - s * 1000 }));
}

/** Every cue of the block, in time order. */
export function allCues(state: TimedState): TimedCue[] {
  const secs = state.options.countdownSec;
  const out: TimedCue[] = [];
  const spec = state.spec;
  if (spec.format === 'tabata') {
    const n = (state.data as { intervals: unknown[] }).intervals.length;
    const workMs = spec.config.workSec * 1000;
    for (let k = 0; k < n; k++) {
      const ws = tabataWorkStartMs(spec.config, k);
      out.push({ type: 'phase_start', phase: 'work', atActiveMs: ws, index: k });
      out.push(...countdownsBefore(ws + workMs, secs));
      if (k < n - 1 && spec.config.restSec > 0) {
        out.push({ type: 'phase_start', phase: 'rest', atActiveMs: ws + workMs, index: k });
        out.push(...countdownsBefore(tabataWorkStartMs(spec.config, k + 1), secs));
      }
    }
    out.push({ type: 'block_end', atActiveMs: tabataTotalMs(spec.config, n) });
  } else if (spec.format === 'emom') {
    const intervalMs = Math.max(1, spec.config.intervalSec) * 1000;
    const n = (state.data as { minutes: unknown[] }).minutes.length;
    for (let i = 0; i < n; i++) {
      out.push({ type: 'minute_start', minute: i, atActiveMs: i * intervalMs });
      out.push(...countdownsBefore((i + 1) * intervalMs, secs));
    }
    out.push({ type: 'block_end', atActiveMs: n * intervalMs });
  } else {
    const cap = timedTotalMs(state);
    out.push(...countdownsBefore(cap, secs));
    out.push({ type: 'cap_reached', atActiveMs: cap });
  }
  return out.sort((a, b) => a.atActiveMs - b.atActiveMs);
}

/** Cues in (fromActiveMs, toActiveMs], with stale ones dropped after a gap. */
export function cuesBetween(state: TimedState, fromActiveMs: number, toActiveMs: number): TimedCue[] {
  if (!(toActiveMs > fromActiveMs)) return [];
  const window = allCues(state).filter((c) => c.atActiveMs > fromActiveMs && c.atActiveMs <= toActiveMs);
  if (toActiveMs - fromActiveMs <= state.options.staleCueMs) return window;
  const freshFrom = toActiveMs - state.options.staleCueMs;
  const lastPhase = [...window].reverse().find((c) => c.type === 'phase_start' || c.type === 'minute_start');
  return window.filter((c) => {
    if (c.type === 'countdown') return c.atActiveMs > freshFrom;
    if (c.type === 'phase_start' || c.type === 'minute_start') return c === lastPhase;
    return true;
  });
}
