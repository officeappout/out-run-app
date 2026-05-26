'use client';

import { useCallback } from 'react';
import { useMediaSession } from './useMediaSession';

/**
 * usePlayerMediaSession — peripheral OS-bridge for the lock-screen "Now Playing" widget.
 *
 * Wraps `useMediaSession` with the StrengthRunner-specific "next track" routing
 * logic — i.e. the OS / headphone-button "skip" gesture maps to a different
 * state-machine action depending on the current phase:
 *
 *   RESTING → skipRest
 *   INPUT   → saveInput (confirm reps and advance to rest)
 *   default → completeExercise (ACTIVE / PREPARING / PAUSED)
 *
 * Pure peripheral — returns void.  No render output.  The orchestrator just
 * invokes this once with state-machine snapshot dependencies and never reads
 * anything back.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-12).
 */

export interface UsePlayerMediaSessionParams {
  /** Current workout state (drives which "next track" action fires). */
  workoutState: 'PREPARING' | 'ACTIVE' | 'INPUT' | 'RESTING' | 'PAUSED';
  /** Active exercise name (shown as the lock-screen title during ACTIVE). */
  exerciseName: string;
  /** Next exercise name (shown as "מנוחה: <name>" during RESTING). */
  nextExerciseName: string;
  /** Workout name (shown as the lock-screen "album" subtitle). */
  workoutName: string;
  /** Cover-art URL — preferred safeImageUrl, falls back to next-exercise imageUrl. */
  artworkUrl: string | null;
  /** Whether the workout is currently paused (drives play/pause icon state). */
  isPaused: boolean;
  /** Skip-rest action — fired by "next track" during RESTING. */
  onSkipRest: () => void;
  /** Confirm-and-save-input action — fired by "next track" during INPUT. */
  onSaveInput: () => void;
  /** Complete-exercise action — fired by "next track" during ACTIVE. */
  onCompleteExercise: () => void;
  /** Toggle-pause action — fired by lock-screen play/pause button. */
  onTogglePause: () => void;
}

export function usePlayerMediaSession({
  workoutState,
  exerciseName,
  nextExerciseName,
  workoutName,
  artworkUrl,
  isPaused,
  onSkipRest,
  onSaveInput,
  onCompleteExercise,
  onTogglePause,
}: UsePlayerMediaSessionParams): void {
  const handleNextTrack = useCallback(() => {
    if (workoutState === 'RESTING') {
      onSkipRest();
    } else if (workoutState === 'INPUT') {
      onSaveInput();
    } else {
      onCompleteExercise();
    }
  }, [workoutState, onSkipRest, onSaveInput, onCompleteExercise]);

  useMediaSession({
    workoutState,
    exerciseName,
    nextExerciseName,
    workoutName,
    exerciseImageUrl: artworkUrl,
    isPaused,
    onNextTrack: handleNextTrack,
    onTogglePause,
  });
}
