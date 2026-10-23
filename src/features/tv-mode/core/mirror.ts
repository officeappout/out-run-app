import type { TvMirror, TvPhase, TvTimer } from './types';

/** A clock that is not counting anything. */
export const NO_TIMER: TvTimer = { dir: 'none', baseMs: 0, running: false, totalMs: 0 };

export function initialMirror(): TvMirror {
  return {
    v: 1,
    seq: 0,
    phase: 'idle',
    paused: false,
    exerciseIndex: 0,
    exerciseCount: 0,
    exerciseName: '',
    setIndex: 1,
    setCount: 1,
    timer: NO_TIMER,
    together: false,
  };
}

/** What the clock reads at `serverNowMs`, given the server time its base was true. */
export function timerReading(timer: TvTimer, anchorAtMs: number | null, serverNowMs: number): number {
  if (timer.dir === 'none') return 0;
  const elapsed = timer.running && anchorAtMs != null ? Math.max(0, serverNowMs - anchorAtMs) : 0;
  return timer.dir === 'down' ? Math.max(0, timer.baseMs - elapsed) : timer.baseMs + elapsed;
}

/** 0..1 progress of the interval, 0 when unknown. */
export function timerProgress(timer: TvTimer, readingMs: number): number {
  if (!timer.totalMs || timer.dir === 'none') return 0;
  const done = timer.dir === 'down' ? timer.totalMs - readingMs : readingMs;
  return Math.min(1, Math.max(0, done / timer.totalMs));
}

export function sameTimer(a: TvTimer, b: TvTimer): boolean {
  return a.dir === b.dir && a.baseMs === b.baseMs && a.running === b.running && a.totalMs === b.totalMs;
}

/** The writer re-stamps the server anchor only when the clock itself changed. */
export function timerChanged(prev: TvMirror | null, next: TvMirror): boolean {
  return !prev || !sameTimer(prev.timer, next.timer);
}

export type MirrorEvent =
  | { type: 'exercise'; index: number; count: number; name: string; id?: string; next?: string; setCount: number; repsMin?: number; repsMax?: number; holdSec?: number }
  | { type: 'set'; setIndex: number }
  | { type: 'phase'; phase: TvPhase; timer: TvTimer }
  | { type: 'pause'; readingMs: number }
  | { type: 'resume' }
  | { type: 'together'; together: boolean }
  | { type: 'done' };

/**
 * The host phone's mirror, event by event. Pure: the timer's server anchor is stamped by the
 * writer when `timerChanged()` says so — a pause stores the reading it froze at.
 */
export function mirrorReducer(state: TvMirror, ev: MirrorEvent): TvMirror {
  const bump = (patch: Partial<TvMirror>): TvMirror => ({ ...state, ...patch, seq: state.seq + 1 });
  switch (ev.type) {
    case 'exercise':
      return bump({
        phase: 'work',
        paused: false,
        exerciseIndex: ev.index,
        exerciseCount: ev.count,
        exerciseId: ev.id,
        exerciseName: ev.name,
        nextExerciseName: ev.next,
        setIndex: 1,
        setCount: Math.max(1, ev.setCount),
        repsMin: ev.repsMin,
        repsMax: ev.repsMax,
        holdSec: ev.holdSec,
        timer: NO_TIMER,
      });
    case 'set':
      return bump({ setIndex: Math.min(Math.max(1, ev.setIndex), state.setCount) });
    case 'phase':
      return bump({ phase: ev.phase, paused: false, timer: ev.timer });
    case 'pause':
      if (state.paused) return state;
      return bump({ paused: true, timer: { ...state.timer, baseMs: Math.max(0, ev.readingMs), running: false } });
    case 'resume':
      if (!state.paused) return state;
      return bump({ paused: false, timer: state.timer.dir === 'none' ? state.timer : { ...state.timer, running: true } });
    case 'together':
      return state.together === ev.together ? state : bump({ together: ev.together });
    case 'done':
      return bump({ phase: 'done', paused: false, timer: NO_TIMER });
  }
}

/** Reject a snapshot that is older than what is already shown. */
export function newerMirror(current: TvMirror | null, incoming: TvMirror | null): TvMirror | null {
  if (!incoming) return current;
  if (!current || incoming.seq >= current.seq) return incoming;
  return current;
}
