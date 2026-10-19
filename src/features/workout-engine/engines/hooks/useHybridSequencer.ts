'use client';

/**
 * useHybridSequencer — thin React shell over the pure hybrid sequencer.
 *
 * The caller feeds run progress (`RUN_TICK` with the running player's
 * cumulative km / elapsed sec and the last GPS fix) and the station's set
 * taps; the hook stamps `atMs`, ticks the transition countdown and resyncs
 * on `visibilitychange`. Not mounted anywhere yet: callers must gate it
 * behind enable_home_v2 (`enabled: false` = inert).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HybridPlannedSegment } from '../../hybrid/compose-hybrid-session.service';
import { createMonotonicNow, type NowFn } from '../clock';
import { initSequencer, reduceSequencer } from '../hybrid/hybrid-sequencer';
import { sequencerView, type SequencerView } from '../hybrid/sequencer.selectors';
import type { SequencerEvent, SequencerOptions, SequencerState } from '../hybrid/sequencer.types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type SequencerEventInput = DistributiveOmit<SequencerEvent, 'atMs'>;

export interface UseHybridSequencerOptions {
  enabled: boolean;
  options?: Partial<SequencerOptions>;
  /** Fired on every phase change (haptic on arrival, toast after a station …). */
  onPhase?: (phase: SequencerState['phase'], state: SequencerState) => void;
  frameMs?: number;
  now?: NowFn;
}

export interface UseHybridSequencer {
  state: SequencerState | null;
  view: SequencerView | null;
  dispatch: (event: SequencerEventInput) => void;
}

export function useHybridSequencer(
  plan: HybridPlannedSegment[] | null,
  opts: UseHybridSequencerOptions,
): UseHybridSequencer {
  const { enabled, options, frameMs = 250 } = opts;
  const now = useMemo(() => opts.now ?? createMonotonicNow(), [opts.now]);
  const [state, setState] = useState<SequencerState | null>(() => (plan ? initSequencer(plan, options) : null));
  const [nowMs, setNowMs] = useState(() => now());
  const onPhase = useRef(opts.onPhase);
  onPhase.current = opts.onPhase;
  const lastPhase = useRef<SequencerState['phase'] | null>(null);

  useEffect(() => {
    setState(plan ? initSequencer(plan, options) : null);
    lastPhase.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const dispatch = useCallback(
    (event: SequencerEventInput) => {
      const atMs = now();
      setState((s) => (s ? reduceSequencer(s, { ...event, atMs } as SequencerEvent) : s));
      setNowMs(atMs);
    },
    [now],
  );

  const phase = state?.phase ?? null;
  // Only the transition countdown needs a clock; everything else is event-driven.
  useEffect(() => {
    if (!enabled || phase !== 'transition') return;
    const tick = () => {
      const atMs = now();
      setState((s) => (s ? reduceSequencer(s, { type: 'TICK', atMs }) : s));
      setNowMs(atMs);
    };
    const id = setInterval(tick, frameMs);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, phase, frameMs, now]);

  useEffect(() => {
    if (!state || state.phase === lastPhase.current) return;
    lastPhase.current = state.phase;
    if (enabled) onPhase.current?.(state.phase, state);
  }, [state, enabled]);

  const view = useMemo(() => (state && enabled ? sequencerView(state, nowMs) : null), [state, nowMs, enabled]);
  return { state, view, dispatch };
}
