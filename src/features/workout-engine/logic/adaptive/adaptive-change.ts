/**
 * What the double progression changed for one exercise, for the user (owner 30.10.2026). Pure.
 * The summary turns each change into one templated line ("מה משתנה בפעם הבאה"); the exercise,
 * numbers and unit are variables, so every exercise gets its line with no per-exercise copy.
 */
import { isStateFresh, overshootOf, type AdaptiveState, type SessionResultInput } from './double-progression';

export type AdaptiveChangeKind = 'harder_variation' | 'jump_top' | 'up' | 'extra_set' | 'down' | 'easier_variation';

export interface AdaptiveChange {
  exerciseId: string;
  exerciseName: string;
  kind: AdaptiveChangeKind;
  /** Today's target → next session's target (reps, or seconds for a hold). */
  from: number;
  to: number;
  /** Lowest / highest confirmed set today. */
  doneMin: number;
  doneMax: number;
  isHold: boolean;
  /** The change came from a big overshoot (jump), not from a streak. */
  overshoot: boolean;
}

/** null = nothing the user needs to hear (held target, skipped session, no state written). */
export function describeAdaptiveChange(
  prev: AdaptiveState | null | undefined,
  next: AdaptiveState | null,
  input: SessionResultInput,
  ids: { exerciseId: string; exerciseName: string },
  nowMs: number,
): AdaptiveChange | null {
  if (!next || input.skip || !input.values.length || next === prev) return null;
  const prevExtra = isStateFresh(prev, nowMs) ? prev.extraSets : 0;
  const { target } = input;
  const overshoot = overshootOf(input) !== 'none';
  let kind: AdaptiveChangeKind | null = null;
  if (next.variationStep === 1) kind = 'harder_variation';
  else if (next.variationStep === -1) kind = 'easier_variation';
  else if (next.extraSets > prevExtra) kind = 'extra_set';
  else if (next.nextTarget > target) kind = overshoot ? 'jump_top' : 'up';
  else if (next.nextTarget < target) kind = 'down';
  if (!kind) return null;
  return {
    ...ids,
    kind,
    from: target,
    to: next.nextTarget,
    doneMin: Math.min(...input.values),
    doneMax: Math.max(...input.values),
    isHold: input.isHold,
    overshoot,
  };
}
