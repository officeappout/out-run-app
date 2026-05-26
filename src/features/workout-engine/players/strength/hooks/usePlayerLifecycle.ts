'use client';

import type { ExerciseResultLog } from './useWorkoutStateMachine';
import { useWorkoutPersistence } from './useWorkoutPersistence';
import { useScreenWakeLock } from './useScreenWakeLock';

/**
 * usePlayerLifecycle — peripheral OS / runtime coordination for the live player.
 *
 * Bundles together two strictly side-effect lifecycle hooks that the orchestrator
 * would otherwise wire up separately:
 *
 *   • useWorkoutPersistence — auto-saves a checkpoint of the active session
 *     (segment / exercise indices, elapsed time, log snapshot) and pauses on
 *     app background / foreground so the user can resume mid-workout.
 *
 *   • useScreenWakeLock — keeps the device screen awake while the workout is
 *     running and not paused (acquires lock on ACTIVE/INPUT/RESTING, releases
 *     on PREPARING/PAUSED or unmount).
 *
 * Pure side-effect coordinator — returns void.  No state, no refs, no
 * derivations bubble back to the caller.  The orchestrator passes in the
 * minimum slice of state-machine values it needs.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-4).
 */

export interface PlayerLifecycleDeps {
  /** Stable identifier of the active workout — checkpoints are keyed to this. */
  workoutId: string;
  /** Current state-machine phase, used to gate persistence + wake-lock. */
  workoutState: string;
  /** Whether the workout is currently paused (suspends wake-lock). */
  isPaused: boolean;
  /** Current navigation indices for auto-save. */
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  /** Elapsed workout time in seconds. */
  elapsedTime: number;
  /** Snapshot accessor for the exercise log — invoked on every checkpoint write. */
  getExerciseLog: () => ExerciseResultLog[];
  /** State-machine action — fired on app background AND foreground. */
  togglePause: () => void;
}

export function usePlayerLifecycle({
  workoutId,
  workoutState,
  isPaused,
  currentSegmentIndex,
  currentExerciseIndex,
  elapsedTime,
  getExerciseLog,
  togglePause,
}: PlayerLifecycleDeps): void {
  useWorkoutPersistence({
    workoutId,
    segmentIndex: currentSegmentIndex,
    exerciseIndex: currentExerciseIndex,
    elapsedTime,
    exerciseLog: getExerciseLog(),
    enabled: workoutState !== 'PREPARING',
    onBackground: togglePause,
    onForeground: togglePause,
  });

  // Wake the screen only while the user is actively training (not preparing,
  // not paused).  The derivation lives here so the orchestrator doesn't need
  // to track which phases keep the screen on.
  const isWorkoutActive =
    workoutState === 'ACTIVE' ||
    workoutState === 'INPUT' ||
    workoutState === 'RESTING';

  useScreenWakeLock(isWorkoutActive && !isPaused);
}
