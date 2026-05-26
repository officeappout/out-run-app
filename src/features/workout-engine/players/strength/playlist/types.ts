/**
 * playlist/types.ts — Shared types for the workout playlist Lego blocks.
 *
 * Source of truth for cross-component shapes consumed by:
 *   - WorkoutPlaylist        (orchestrator)
 *   - SupersetBlockGroup     (paired-exercise wrapper)
 *   - StrengthExerciseCard   (single exercise card)
 *   - StrengthSetRow         (atomic per-set row)
 *   - WorkoutBlockCard       (legacy warmup/cooldown grouped card)
 *
 * Pure types only — no runtime code lives here, so this file is safe to
 * import from any layer without creating a circular dependency.
 */

import type { Exercise as WorkoutExercise } from '@/features/parks';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';

export type BlockStatus = 'completed' | 'active' | 'upcoming';

/**
 * Bridge shape between the workout plan data and the UI cards.
 *
 * Carries everything a card needs to render one exercise and react to
 * pill taps, including per-set logged reps and the callback handles
 * for opening the rep-entry modal / direct-complete CTA.
 */
export interface ExerciseEntry {
  exerciseId: string;
  exerciseName: string;
  imageUrl?: string | null;
  sets: number;
  repsText: string;
  exerciseType: 'reps' | 'time';
  targetReps: number;
  status: BlockStatus;
  currentSetIndex: number;
  loggedReps: (number | null)[];
  loggedRepsRight?: (number | null)[];
  loggedRepsLeft?: (number | null)[];
  restDuration: number;
  /**
   * Fired when a pill is tapped AND the playlist-level validation
   * (cursor turn, future-set guard) decides the tap should be honored.
   * The new Lego architecture also lets a row open its own DataEntryModal
   * directly via this callback, so the modal lifecycle is sealed inside
   * the row instance.
   */
  onPillTap: (setIndex: number) => void;
  /**
   * Warmup / cooldown one-tap completion (no rep entry).  Undefined for
   * main-segment exercises that always log via the modal.
   */
  onDirectComplete?: () => void;
  /** Repetition Pyramid: per-set rep targets (e.g., [12,10,8,6]) */
  repsSequence?: number[];
  /** Mechanical Pyramid: per-set exercise variants */
  pyramidSequence?: PyramidStep[];
}

/**
 * Flattened representation of one exercise after the workout plan is
 * normalized.  Built by `flattenWorkoutToExercises` in grouping.utils.ts.
 */
export interface FlatExercise {
  key: string;
  segmentIndex: number;
  exerciseIndex: number;
  exercise: WorkoutExercise;
  sets: number;
  targetReps: number;
  repsText: string;
  exerciseType: 'reps' | 'time';
  restDuration: number;
  segmentTitle: string;
  /** Per-set rep ladder for Repetition Pyramids (e.g., [12, 10, 8, 6]) */
  repsSequence?: number[];
  /** Per-set exercise variants for Mechanical Pyramids */
  pyramidSequence?: PyramidStep[];
}

/**
 * One render-group inside a segment.  Supersets cluster their two
 * partners; everything else is a solo group of size 1.  In the blended
 * Lego architecture this is the dispatch unit — the playlist switches
 * on `isSuperSet` (and future `blockType`) to pick the right component.
 */
export interface SubGroup {
  key: string;
  exercises: FlatExercise[];
  isSuperSet: boolean;
  /**
   * Override title for pyramid blocks.  When set, the wrapping card uses
   * this in place of the generic segment title so the header shows the
   * correct pyramid label ("סט שיא", "פירמידה עולה-יורדת"...).
   */
  groupTitle?: string;
}
