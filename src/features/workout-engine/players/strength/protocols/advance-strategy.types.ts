/**
 * advance-strategy.types — contracts for the advance ("head") layer
 * (protocol-blocks Stage 1a, 11.07.2026).
 *
 * Stage 1a extracts today's moveToNext monolith VERBATIM into a pure
 * decision function; Stage 1b splits it into per-protocol strategies behind
 * a registry; block-scoped heads (tabata/emom/amrap) land in Stages 2-3.
 */
import type { WorkoutSegment } from '@/features/parks/core/types/route.types';

/** Minimal structural view of a segment exercise (five storage shapes exist). */
export interface AdvanceExercise {
  id: string;
  name?: string;
  pairedWith?: string | null;
  pyramidSequence?: unknown[];
  [key: string]: unknown;
}

/** Minimal structural view of a log entry (avoids importing the hook). */
export interface AdvanceLogEntry {
  exerciseId: string;
  segmentId: string;
  confirmedReps: number[];
}

export interface AdvanceContext {
  segments: WorkoutSegment[];
  currentSegmentIndex: number;
  /** Exercise index BEFORE the advance (the setState updater's prev value). */
  prevExerciseIndex: number;
  /** Set/round index at the moment of the advance (currentSetRef). */
  setIdx: number;
  log: ReadonlyArray<AdvanceLogEntry>;
  /** The hook's five-shape exercises accessor — passed in, never re-implemented. */
  getExercises: (segment: WorkoutSegment | undefined) => AdvanceExercise[] | null;
  /** effectiveSetsForExercise (set-target.utils) via the hook's callback. */
  getSets: (ex: AdvanceExercise | null | undefined) => number;
}

export type AdvanceDecision =
  /** Stay on the exercise, advance the set counter. */
  | { kind: 'sameExercise'; nextSetIdx: number }
  /** Jump to another exercise in the SAME segment.
   *  nextSetIdx null = leave the round counter unchanged (superset A→B). */
  | { kind: 'goToExercise'; exerciseIndex: number; nextSetIdx: number | null }
  /** Segment exhausted — move to this (already-validated) segment index. */
  | { kind: 'nextSegment'; segmentIndex: number }
  /** No more segments — workout is complete. */
  | { kind: 'workoutComplete' };

/**
 * An advance head: pure (ctx) → decision. Exercise-scoped heads
 * (straight/superset/pyramid) are dispatched per-exercise by the registry;
 * block-scoped heads (tabata/emom/amrap, Stages 2-3) will be dispatched by
 * segment.protocol instead.
 */
export type AdvanceStrategy = (ctx: AdvanceContext) => AdvanceDecision;
