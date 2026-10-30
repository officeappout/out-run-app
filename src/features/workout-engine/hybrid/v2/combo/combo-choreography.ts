/**
 * Combined-workout choreography (enable_combo_flow_v1, canvas boards PlayerTransition* + Rules).
 * PURE: which stage change just happened, and the timed steps that follow it.
 *
 *   start      idle → first leg          list drops 0.8, "now" on the first block 0.8, chip 1.2
 *   toStation  arrival card → station    list drops 0.6, dot moves 0.7, list rises 0.5
 *   toWalk     station done → next leg   list drops 0.6, dot moves 0.7, list rises 0.5
 *   finish     last block → done         list drops 0.6, all blocks done 1.0, then the ring
 *
 * The celebrate part (arrival card, station-done sheet) is user-paced and not a timed step here.
 * `withLayer: false` drops the list steps (the drawer choreography lands in its own stage), so
 * only the start chip remains. Reduced motion: the list fades in for a moment, no dot move.
 */

import type { SequencerPhase } from '../../../engines/hybrid/sequencer.types';

export type ComboTransitionKind = 'start' | 'toStation' | 'toWalk' | 'finish';
/** reveal = the session list drops · move = "now" / the dot moves · open = the next player is up. */
export type ComboStage = 'reveal' | 'move' | 'open';

export interface ComboStep {
  stage: ComboStage;
  ms: number;
}

export interface ComboPoint {
  phase: SequencerPhase;
  cursor: number;
}

export const COMBO_TIMING = Object.freeze({
  reveal: 600,
  move: 700,
  open: 500,
  startReveal: 800,
  startMove: 800,
  startChip: 1200,
  finishMove: 1000,
  reducedReveal: 600,
});

const isLeg = (p: SequencerPhase) => p === 'run' || p === 'cooldown';

/** The stage change between two sequencer points, or null (same stage, a tick, a pause). */
export function detectComboTransition(prev: ComboPoint | null, next: ComboPoint | null): ComboTransitionKind | null {
  if (!next) return null;
  const from = prev?.phase ?? 'idle';
  if (from === next.phase && (prev?.cursor ?? -1) === next.cursor) return null;
  if (next.phase === 'done') return from === 'done' ? null : 'finish';
  if (from === 'idle' && isLeg(next.phase)) return 'start';
  if (from === 'transition' && next.phase === 'station') return 'toStation';
  if (from === 'station' && isLeg(next.phase)) return 'toWalk';
  return null;
}

export interface ComboStepOptions {
  /** The session list drop / dot move is wired (the drawer stage). */
  withLayer: boolean;
  reducedMotion: boolean;
}

export function comboSteps(kind: ComboTransitionKind, { withLayer, reducedMotion }: ComboStepOptions): ComboStep[] {
  const chip: ComboStep[] = kind === 'start' ? [{ stage: 'open', ms: COMBO_TIMING.startChip }] : [];
  if (!withLayer) return chip;
  if (reducedMotion) return [{ stage: 'reveal', ms: COMBO_TIMING.reducedReveal }, ...chip];
  switch (kind) {
    case 'start':
      return [{ stage: 'reveal', ms: COMBO_TIMING.startReveal }, { stage: 'move', ms: COMBO_TIMING.startMove }, ...chip];
    case 'finish':
      return [{ stage: 'reveal', ms: COMBO_TIMING.reveal }, { stage: 'move', ms: COMBO_TIMING.finishMove }];
    default:
      return [
        { stage: 'reveal', ms: COMBO_TIMING.reveal },
        { stage: 'move', ms: COMBO_TIMING.move },
        { stage: 'open', ms: COMBO_TIMING.open },
      ];
  }
}

/** The stage `elapsedMs` into the steps, or null once they ran out. */
export function stageAt(steps: readonly ComboStep[], elapsedMs: number): ComboStage | null {
  if (!(elapsedMs >= 0)) return steps[0]?.stage ?? null;
  let t = 0;
  for (const s of steps) {
    t += s.ms;
    if (elapsedMs < t) return s.stage;
  }
  return null;
}

export const totalMs = (steps: readonly ComboStep[]) => steps.reduce((a, s) => a + s.ms, 0);

/** Minutes of the first leg for the start chip ("off we go · 6 min to the station"), or null. */
export function startChipMinutes(firstLeg: { kind: string; durationSec?: number } | undefined): number | null {
  if (!firstLeg || firstLeg.kind !== 'aerobic') return null;
  const min = Math.round((firstLeg.durationSec ?? 0) / 60);
  return min > 0 ? min : null;
}
