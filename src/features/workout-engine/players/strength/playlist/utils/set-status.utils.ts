/**
 * set-status.utils.ts — Per-set progress derivations.
 *
 * Pure helpers extracted from WorkoutBlockCard.tsx and the cursor-status
 * logic from WorkoutPlaylist.tsx so the same algorithm powers every
 * pill, every card, every preview drawer, and the StrengthRunner header
 * pills.  No drift, one source of truth.
 */

import type { SetPillData } from '../SetPillsGrid';
import type { BlockStatus, ExerciseEntry, FlatExercise } from '../types';

/**
 * Returns the index of the first set that hasn't been completed yet,
 * considering both logged reps (DataEntryModal) and the state machine
 * cursor (`entry.currentSetIndex`).  Returns -1 if every set is done.
 */
export function findFirstIncompleteSet(entry: ExerciseEntry): number {
  for (let j = 0; j < entry.sets; j++) {
    if (entry.loggedReps[j] === null && j >= entry.currentSetIndex) {
      return j;
    }
  }
  return -1;
}

/**
 * Resolves the per-set target for an exercise, preferring:
 *   1. mechanical pyramid step  (entry.pyramidSequence[setIdx])
 *   2. repetition pyramid       (entry.repsSequence[setIdx])
 *   3. static target            (entry.targetReps)
 */
export function resolveSetTarget(entry: ExerciseEntry, setIdx: number): number {
  const pyramidTarget =
    entry.pyramidSequence?.[setIdx]?.targetReps ??
    entry.pyramidSequence?.[setIdx]?.targetHold;
  if (typeof pyramidTarget === 'number') return pyramidTarget;
  const repsSeqTarget = entry.repsSequence?.[setIdx];
  if (typeof repsSeqTarget === 'number') return repsSeqTarget;
  return entry.targetReps;
}

/**
 * Builds the per-pill view-models for an exercise.  The status field on
 * each pill drives styling in `SetPillsGrid` / `StrengthSetRow`:
 *   completed → cyan gradient + logged value
 *   active    → gradient border + live target
 *   upcoming  → muted outline
 */
export function buildPills(entry: ExerciseEntry): SetPillData[] {
  const isCompleted = entry.status === 'completed';
  const isEntryActive = entry.status === 'active';
  const firstIncompleteSet = isEntryActive ? findFirstIncompleteSet(entry) : -1;

  return Array.from({ length: entry.sets }, (_, i): SetPillData => {
    let pillStatus: 'completed' | 'active' | 'upcoming';
    if (isCompleted) {
      pillStatus = 'completed';
    } else if (isEntryActive) {
      if (firstIncompleteSet === -1) {
        pillStatus = 'completed';
      } else if (i < firstIncompleteSet) {
        pillStatus = 'completed';
      } else if (i === firstIncompleteSet) {
        pillStatus = 'active';
      } else {
        pillStatus = 'upcoming';
      }
    } else {
      pillStatus = 'upcoming';
    }
    return {
      setIndex: i,
      status: pillStatus,
      targetReps: resolveSetTarget(entry, i),
      loggedReps: entry.loggedReps[i] ?? null,
      loggedRepsRight: entry.loggedRepsRight?.[i] ?? null,
      loggedRepsLeft: entry.loggedRepsLeft?.[i] ?? null,
      isTimeBased: entry.exerciseType === 'time',
    };
  });
}

/**
 * Computes a `BlockStatus` for one flat exercise relative to the live
 * state-machine cursor.
 *
 * Superset Safeguard: a lower-index exercise (A) must not be marked
 * `completed` while it still has unfinished rounds.  During superset
 * alternation the cursor moves A→B→A→B, so A's exerciseIndex is
 * numerically behind B's even while A is still accumulating sets.
 * The log cross-check (`confirmedSetsLookup`) keeps A `active` until
 * every planned set is registered.
 */
export function getBlockStatus(
  fe: FlatExercise,
  cursor: { segmentIndex: number; exerciseIndex: number },
  /**
   * (exerciseId, segmentIndex) → number of confirmed sets already logged.
   * Caller usually derives this from the same `logLookup` map that powers
   * `getLoggedReps`, so we don't re-hit the array per call.
   */
  confirmedSetsLookup: (fe: FlatExercise) => number,
): BlockStatus {
  if (
    fe.segmentIndex < cursor.segmentIndex ||
    (fe.segmentIndex === cursor.segmentIndex && fe.exerciseIndex < cursor.exerciseIndex)
  ) {
    const confirmedSets = confirmedSetsLookup(fe);
    // Guard: an exercise with 0 confirmed sets has not started yet.
    // Only superset partners that have already begun accumulating rounds
    // should stay 'active' while the cursor is ahead of them.
    // Untouched downstream exercises (sandwich or trailing siblings) must
    // remain 'upcoming' regardless of their position relative to the cursor.
    if (confirmedSets > 0 && confirmedSets < fe.sets) {
      return 'active'; // superset partner still accumulating rounds
    }
    if (confirmedSets === 0) {
      return 'upcoming'; // never started — not a superset partner
    }
    return 'completed';
  }
  if (
    fe.segmentIndex === cursor.segmentIndex &&
    fe.exerciseIndex === cursor.exerciseIndex
  ) {
    return 'active';
  }
  return 'upcoming';
}
