'use client';

import { useCallback, useRef } from 'react';
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
 *     (segment / exercise indices, elapsed time, log snapshot) and, via the
 *     intent-preserving handlers below, auto-pauses on app background and
 *     auto-resumes on foreground — but only when THIS hook caused the pause.
 *     A pause the user set manually before backgrounding is left untouched.
 *
 *   • useScreenWakeLock — keeps the device screen awake while the workout is
 *     running and not paused (acquires lock on ACTIVE/INPUT/RESTING, releases
 *     on PREPARING/PAUSED or unmount).
 *
 * Pure side-effect coordinator — returns void.  Holds one internal ref
 * (auto-pause intent tracking, not exposed) but no derivations bubble back
 * to the caller.  The orchestrator passes in the minimum slice of
 * state-machine values it needs.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-4).
 * Background/foreground intent-tracking fix: B4 (see commit for details) —
 * togglePause() is a blind flip with no idempotency guard, so wiring both
 * onBackground and onForeground straight to it lost the distinction between
 * "auto-paused, should auto-resume" and "user paused manually, should stay
 * paused". Fixed locally here without touching togglePause itself.
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
  /**
   * State-machine action — a pure flip with no idempotency guard. This hook
   * wraps it with intent-preserving background/foreground handlers below;
   * callers should not pass this straight through to both lifecycle events.
   */
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
  // Distinguishes "auto-paused because the app was backgrounded, should
  // auto-resume on foreground" from "user manually paused, should STAY
  // paused on foreground". togglePause() is a blind flip (see
  // useWorkoutStateMachine.ts) — it does not expose separate pause()/
  // resume() actions, so intent has to be tracked here, at the call site
  // that has both the background/foreground signal AND the current
  // isPaused value. Local ref, not store state: this is lifecycle-local
  // bookkeeping, not workout state.
  const autoPausedRef = useRef(false);

  const handleBackground = useCallback(() => {
    if (isPaused) {
      // Already paused — the user paused manually before backgrounding.
      // Leave it exactly as-is: do NOT flip (that would accidentally
      // RESUME it) and do NOT record an auto-pause we didn't cause.
      return;
    }
    autoPausedRef.current = true;
    togglePause();
  }, [isPaused, togglePause]);

  const handleForeground = useCallback(() => {
    if (!autoPausedRef.current) {
      // No auto-pause recorded — either the workout was already paused
      // manually before backgrounding, or it wasn't running when the app
      // backgrounded. Either way, leave the pause state untouched.
      return;
    }
    autoPausedRef.current = false;
    togglePause();
  }, [togglePause]);

  useWorkoutPersistence({
    workoutId,
    segmentIndex: currentSegmentIndex,
    exerciseIndex: currentExerciseIndex,
    elapsedTime,
    exerciseLog: getExerciseLog(),
    enabled: workoutState !== 'PREPARING',
    onBackground: handleBackground,
    onForeground: handleForeground,
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
