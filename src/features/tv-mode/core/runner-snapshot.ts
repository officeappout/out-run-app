import type { TvMedia, TvMode, TvPhase, TvTimer } from './types';

/**
 * What a player tells TV mode about itself, as plain data (no React, no Firebase). A player builds one
 * of these on every change and `advanceRunnerMirror` turns the changes into mirror events.
 */
export interface RunnerSnapshot {
  /** Identity of the exercise on screen; a new key = a new exercise (the mirror restarts its set / timer). */
  exerciseKey: string;
  exerciseIndex: number;
  exerciseCount: number;
  exerciseId?: string;
  exerciseName: string;
  nextExerciseName?: string;
  media?: TvMedia;
  nextMedia?: TvMedia;
  mode: TvMode;
  /** 1-based. */
  setIndex: number;
  setCount: number;
  repsMin?: number;
  repsMax?: number;
  holdSec?: number;

  phase: TvPhase;
  paused: boolean;
  /** The clock being shown, TRUE at the moment the snapshot was built. `none` = nothing counts (reps set). */
  timer: TvTimer;
  /** Other people are in the room. */
  together: boolean;
}

/** A pause-able clock that is not counting anything. */
export const IDLE_SNAPSHOT_TIMER: TvTimer = { dir: 'none', baseMs: 0, running: false, totalMs: 0 };
