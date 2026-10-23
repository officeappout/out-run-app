/**
 * Wide-player keyboard: which player action an intent means right now. Pure.
 *   Space → done (reps set) / pause (timed, rest, timed blocks) / resume (paused, minimized → expand)
 *   →     → next: done on a reps set, skip on rest
 *   ←     → back: opens the exit-confirm (there is no "previous exercise")
 *   Esc   → minimize (or expand when minimized)
 */
import type { WideIntent } from '../../shared/v2/wide-keys';

export type WideAction = 'complete' | 'skipRest' | 'togglePause' | 'exitConfirm' | 'minimize' | 'expand';

export interface WideKeyContext {
  workoutState: 'PREPARING' | 'ACTIVE' | 'INPUT' | 'RESTING' | string;
  /** The ACTIVE exercise runs on a clock (timer card / tabata) or the timed-block engine is on. */
  clockDriven: boolean;
  minimized: boolean;
  paused: boolean;
  /** Exit-confirm modal or a guided overlay (find equipment / demo gate / tour) is up. */
  blocked: boolean;
}

export function resolveWideAction(intent: WideIntent, c: WideKeyContext): WideAction | null {
  if (c.blocked) return null;
  if (c.minimized) return intent === 'primary' || intent === 'minimize' ? 'expand' : null;
  if (intent === 'minimize') return 'minimize';
  if (intent === 'back') return 'exitConfirm';
  if (c.paused) return intent === 'primary' ? 'togglePause' : null;
  if (c.workoutState === 'RESTING') return intent === 'next' ? 'skipRest' : 'togglePause';
  if (c.workoutState === 'ACTIVE') {
    if (intent === 'primary') return c.clockDriven ? 'togglePause' : 'complete';
    return c.clockDriven ? null : 'complete';
  }
  return null;
}
