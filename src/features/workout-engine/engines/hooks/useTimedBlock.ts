'use client';

/**
 * useTimedBlock — thin React shell over the pure timed engine.
 *
 * The interval below only refreshes `nowMs` for the display and fires cues;
 * it never adds time. Position = f(start, pauses, now), so a throttled or
 * suspended timer (app in background) is exact again on the next frame —
 * and `visibilitychange` forces that frame immediately on resume.
 *
 * Not mounted anywhere yet: callers must gate it behind enable_home_v2
 * (pass `enabled: false` and nothing runs).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMonotonicNow, type NowFn } from '../clock';
import { initTimed, reduceTimed, syncTimed } from '../timed/timed-machine';
import { timedView, type TimedView } from '../timed/timed.selectors';
import { cuesBetween } from '../timed/timed-cues';
import { activeMsAt } from '../timed/timed-clock';
import { buildTimedResult, type TimedBlockResult } from '../timed/timed-result';
import type { TimedBlockSpec, TimedCue, TimedEvent, TimedOptions, TimedState } from '../timed/timed.types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type TimedEventInput = DistributiveOmit<TimedEvent, 'atMs'>;

export interface UseTimedBlockOptions {
  enabled: boolean;
  options?: TimedOptions;
  onCue?: (cue: TimedCue) => void;
  /** Called once when the block reaches 'done'. */
  onDone?: (result: TimedBlockResult) => void;
  /** Display refresh period (ms). Default 200. */
  frameMs?: number;
  now?: NowFn;
}

export interface UseTimedBlock {
  state: TimedState | null;
  view: TimedView | null;
  dispatch: (event: TimedEventInput) => void;
}

export function useTimedBlock(spec: TimedBlockSpec | null, opts: UseTimedBlockOptions): UseTimedBlock {
  const { enabled, options, frameMs = 200 } = opts;
  const now = useMemo(() => opts.now ?? createMonotonicNow(), [opts.now]);
  const [state, setState] = useState<TimedState | null>(() => (spec ? initTimed(spec, options) : null));
  const [nowMs, setNowMs] = useState(() => now());
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastActive = useRef(0);
  const doneFired = useRef(false);
  const cbs = useRef({ onCue: opts.onCue, onDone: opts.onDone });
  cbs.current = { onCue: opts.onCue, onDone: opts.onDone };

  // A new spec starts a new block.
  useEffect(() => {
    setState(spec ? initTimed(spec, options) : null);
    lastActive.current = 0;
    doneFired.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const dispatch = useCallback(
    (event: TimedEventInput) => {
      const atMs = now();
      setState((s) => (s ? reduceTimed(s, { ...event, atMs } as TimedEvent) : s));
      setNowMs(atMs);
    },
    [now],
  );

  const frame = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const t = now();
    const synced = syncTimed(s, t);
    const active = activeMsAt(synced.clock, t);
    const onCue = cbs.current.onCue;
    if (onCue) for (const cue of cuesBetween(synced, lastActive.current, active)) onCue(cue);
    lastActive.current = active;
    if (synced !== s) setState(synced);
    setNowMs(t);
  }, [now]);

  const status = state?.status ?? null;
  useEffect(() => {
    if (!enabled || status == null || status === 'idle' || status === 'done') return;
    const id = setInterval(frame, frameMs);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') frame();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, status, frame, frameMs]);

  useEffect(() => {
    if (state?.status === 'done' && !doneFired.current) {
      doneFired.current = true;
      cbs.current.onDone?.(buildTimedResult(state));
    }
  }, [state]);

  const view = useMemo(() => (state && enabled ? timedView(state, nowMs) : null), [state, nowMs, enabled]);
  return { state, view, dispatch };
}
