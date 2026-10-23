import { mirrorReducer, initialMirror } from './mirror';
import { ageTimer, timersEquivalent } from './runner-timer';
import { IDLE_SNAPSHOT_TIMER, type RunnerSnapshot } from './runner-snapshot';
import { sameMedia } from './media';
import type { TvMirror, TvTimer } from './types';

/** The mirror a player has built so far, plus what the next diff needs. */
export interface RunnerMirrorState {
  mirror: TvMirror;
  /** `exerciseKey` of the exercise the mirror shows, null before the first. */
  exerciseKey: string | null;
  /** Local time the mirror's timer was last changed (its `baseMs` is true then). */
  timerSetAtMs: number;
}

/** Seq starts from the clock so a player that mounts again (next station, page reload) always outranks the last one. */
export function startRunnerMirror(nowMs: number): RunnerMirrorState {
  return { mirror: { ...initialMirror(), seq: nowMs }, exerciseKey: null, timerSetAtMs: nowMs };
}

const clampSet = (n: number, count: number) => Math.min(Math.max(1, Math.round(n) || 1), Math.max(1, count));

/**
 * Fold one snapshot into the mirror. Pure; returns the SAME state object when nothing the TV shows
 * changed (a tick of the player's own clock is not a change), so callers can skip the write.
 */
export function advanceRunnerMirror(prev: RunnerMirrorState, snap: RunnerSnapshot, nowMs: number): RunnerMirrorState {
  let m = prev.mirror;
  let key = prev.exerciseKey;
  let timerSetAtMs = prev.timerSetAtMs;

  if (key !== snap.exerciseKey) {
    m = mirrorReducer(m, {
      type: 'exercise',
      index: snap.exerciseIndex,
      count: snap.exerciseCount,
      name: snap.exerciseName,
      id: snap.exerciseId,
      next: snap.nextExerciseName,
      setCount: snap.setCount,
      repsMin: snap.repsMin,
      repsMax: snap.repsMax,
      holdSec: snap.holdSec,
      media: snap.media,
      nextMedia: snap.nextMedia,
      mode: snap.mode,
    });
    key = snap.exerciseKey;
    timerSetAtMs = nowMs;
  }

  const set = clampSet(snap.setIndex, m.setCount);
  if (m.setIndex !== set) m = mirrorReducer(m, { type: 'set', setIndex: set });

  if (snap.phase === 'done') {
    if (m.phase !== 'done') {
      m = mirrorReducer(m, { type: 'done' });
      timerSetAtMs = nowMs;
    }
  } else {
    // While paused the clock is frozen at its reading: the mirror stores it as not running.
    const wanted: TvTimer = snap.paused ? { ...snap.timer, running: false } : snap.timer;
    const same = timersEquivalent(m.timer, nowMs - timerSetAtMs, wanted);
    if (m.phase !== snap.phase || !same) {
      m = mirrorReducer(m, { type: 'phase', phase: snap.phase, timer: wanted });
      timerSetAtMs = nowMs;
      if (snap.paused) m = mirrorReducer(m, { type: 'pause', readingMs: wanted.baseMs });
    } else if (snap.paused && !m.paused) {
      m = mirrorReducer(m, { type: 'pause', readingMs: wanted.baseMs });
      timerSetAtMs = nowMs;
    } else if (!snap.paused && m.paused) {
      m = mirrorReducer(m, { type: 'resume' });
      timerSetAtMs = nowMs;
    }
  }

  if (m.together !== snap.together) m = mirrorReducer(m, { type: 'together', together: snap.together });

  // Media can arrive a moment after the exercise (a late-resolved URL): refresh it without restarting the set.
  if (!sameMedia(m.media, snap.media) || !sameMedia(m.nextMedia, snap.nextMedia)) {
    m = { ...m, media: snap.media, nextMedia: snap.nextMedia, seq: m.seq + 1 };
  }

  return m === prev.mirror && key === prev.exerciseKey ? prev : { mirror: m, exerciseKey: key, timerSetAtMs };
}

/**
 * The mirror as it is true at `nowMs`: its timer's base moves forward by the time since it was set (the
 * write is a moment later than the change). `lastWritten` reuses the previous timer object while the clock
 * has not changed, so the writer does not re-stamp an unchanged clock.
 */
export function mirrorForWrite(state: RunnerMirrorState, nowMs: number, lastWritten: { timerSetAtMs: number; timer: TvTimer } | null): { mirror: TvMirror; written: { timerSetAtMs: number; timer: TvTimer } } {
  if (lastWritten && lastWritten.timerSetAtMs === state.timerSetAtMs) {
    return { mirror: { ...state.mirror, timer: lastWritten.timer }, written: lastWritten };
  }
  const timer = ageTimer(state.mirror.timer, nowMs - state.timerSetAtMs) ?? IDLE_SNAPSHOT_TIMER;
  return { mirror: { ...state.mirror, timer }, written: { timerSetAtMs: state.timerSetAtMs, timer } };
}
