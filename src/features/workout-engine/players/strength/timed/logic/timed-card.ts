/**
 * timed-card — which bottom card the timed player shows (pure). A pause
 * keeps the card of the phase underneath it (the pause overlay sits on top).
 */
import type { TimedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import { tabataPositionAt } from '@/features/workout-engine/engines/timed/tabata-schedule';
import type { EmomState, TabataState, TimedPhase, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import type { TimedPrompt } from './timed-prompt';

export type TimedCardMode = 'ready' | 'prompt' | 'done' | 'work' | 'clock' | 'rest';

/** The live phase, seen through a pause. */
export function underlyingPhase(state: TimedState, view: TimedView): TimedPhase {
  if (view.phase !== 'paused') return view.phase;
  if (state.spec.format === 'tabata') {
    const s = state as TabataState;
    const pos = tabataPositionAt(s.spec.config, s.data.intervals.length, view.activeMs);
    return pos.phase === 'done' ? 'done' : pos.phase;
  }
  const aerobic = view.current?.kind === 'aerobic_leg';
  if (state.spec.format === 'emom') {
    const m = (state as EmomState).data.minutes[view.round - 1];
    if (m && m.status !== 'pending') return 'rest';
  }
  return aerobic ? 'aerobic' : 'work';
}

export function timedCardMode(state: TimedState, view: TimedView, prompt: TimedPrompt | null): TimedCardMode {
  if (prompt) return 'prompt';
  if (state.status === 'idle') return 'ready';
  if (state.status === 'done' || state.status === 'awaiting_partial') return 'done';
  const phase = underlyingPhase(state, view);
  if (phase === 'rest') return 'rest';
  if (phase === 'done') return 'done';
  if (state.spec.format === 'tabata') return 'clock';
  return 'work';
}
