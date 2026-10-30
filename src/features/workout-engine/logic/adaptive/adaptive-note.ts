/**
 * The tag on the NEXT workout's exercise that explains an adaptive change (owner 30.10.2026). Pure.
 *   save time  → the change is kept on the exercise's adaptive state (`lastChange`)
 *   generation → the exercise that carries it out gets an `AdaptiveNote` with TODAY's numbers;
 *                a harder / easier variation picked by the variation bonus gets the source's note.
 * Shown once: the next save of that exercise rewrites (or drops) `lastChange`.
 */
import type { AdaptiveChange, AdaptiveChangeKind } from './adaptive-change';
import { isStateFresh, type AdaptiveState } from './double-progression';

export interface AdaptiveLastChange {
  kind: AdaptiveChangeKind;
  from: number;
  doneMin: number;
  doneMax: number;
  /** The exercise's name when the change was saved (variation tag: "you did 15 of X"). */
  name: string;
}

export interface AdaptiveNote {
  kind: AdaptiveChangeKind;
  /** Today's target (reps, or seconds for a hold). */
  to: number;
  doneMin: number;
  doneMax: number;
  isHold: boolean;
  /** Variation tags only: the exercise the user did last time. */
  prevName?: string;
}

/** The state to save: carries this session's change, or none (an old one is dropped). */
export function withLastChange(next: AdaptiveState, change: AdaptiveChange | null): AdaptiveState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lastChange: _old, ...rest } = next;
  if (!change) return rest;
  return {
    ...rest,
    lastChange: { kind: change.kind, from: change.from, doneMin: change.doneMin, doneMax: change.doneMax, name: change.exerciseName },
  };
}

const VARIATION_RE = /dp_(harder|easier):[^,(]*\(from=([^)]+)\)/;

/** The source exercise behind a variation bonus in the scoring reasons, if any. */
function variationSource(reasoning: readonly string[]): { step: 1 | -1; sourceId: string } | null {
  for (const r of reasoning) {
    const m = VARIATION_RE.exec(r);
    if (m) return { step: m[1] === 'harder' ? 1 : -1, sourceId: m[2] };
  }
  return null;
}

export function adaptiveNoteFor(args: {
  exerciseId: string;
  states: Record<string, AdaptiveState> | undefined;
  reasoning: readonly string[];
  /** Today's target after every adjustment. */
  reps: number;
  isHold: boolean;
  /** An earned extra set was actually added today. */
  extraApplied: boolean;
  nowMs: number;
}): AdaptiveNote | undefined {
  const { exerciseId, states, reps, isHold, nowMs } = args;
  if (!states) return undefined;
  const own = states[exerciseId];
  if (isStateFresh(own, nowMs)) {
    const lc = own.lastChange;
    if (!lc) return undefined;
    const shows =
      ((lc.kind === 'up' || lc.kind === 'jump_top') && reps > lc.from) ||
      (lc.kind === 'down' && reps < lc.from) ||
      (lc.kind === 'extra_set' && args.extraApplied);
    return shows ? { kind: lc.kind, to: reps, doneMin: lc.doneMin, doneMax: lc.doneMax, isHold } : undefined;
  }
  // No own progression yet: a variation picked because another exercise asked for it.
  const v = variationSource(args.reasoning);
  const src = v ? states[v.sourceId] : undefined;
  if (!v || !isStateFresh(src, nowMs) || src.variationStep !== v.step || !src.lastChange) return undefined;
  return {
    kind: v.step === 1 ? 'harder_variation' : 'easier_variation',
    to: reps,
    doneMin: src.lastChange.doneMin,
    doneMax: src.lastChange.doneMax,
    isHold: src.isHold,
    prevName: src.lastChange.name,
  };
}
