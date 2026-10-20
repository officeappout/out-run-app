'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AFTER_PILL_MS,
  DEMO_LOOP_MS,
  DEMO_START_DELAY_MS,
  NUDGE_DELAY_MS,
  NUDGE_MS,
  buildDemoLoop,
  initStripHint,
  stripHintReducer,
  stripHintView,
  type InteractionKind,
  type StripHintView,
} from './strip-hint';

interface UseStripHintArgs {
  /** enable_strength_quiz_hint_v2 && v2 && the coverflow strip is on screen. */
  enabled: boolean;
  isFirstCategory: boolean;
  /** Re-initialise on a category switch without a remount. */
  resetKey: string;
  /** The strip has positioned and its first thumbnails exist — the demo / nudge may start. */
  stripReady: boolean;
  stepsLength: number;
  /** Where the demo starts (and where a CTA press during the demo confirms). */
  baseIndex: number;
  /** Moves the selection for the demo — must NOT count as a user choice. */
  onDemoSelect: (index: number) => void;
}

export interface StripHintControls extends StripHintView {
  enabled: boolean;
  reducedMotion: boolean;
  /** Increments on each finger ride — key the finger's animation on it. */
  fingerRun: number;
  /** A real interaction with the strip or the stepper. */
  interact: (kind?: InteractionKind) => void;
  /** Synchronous read — true until the first real interaction (safe inside the same event). */
  isDemoRunning: () => boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Glue for strip-hint.ts: timers for the demo loop, the nudge and the "after" line. */
export function useStripHint({
  enabled,
  isFirstCategory,
  resetKey,
  stripReady,
  stepsLength,
  baseIndex,
  onDemoSelect,
}: UseStripHintArgs): StripHintControls {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [state, dispatch] = useReducer(
    stripHintReducer,
    { enabled, isFirstCategory, reducedMotion },
    initStripHint,
  );
  const [fingerRun, setFingerRun] = useState(0);

  // Mirrors state.demoRunning, but flips synchronously inside interact() so a tap's own
  // click (same gesture as the pointerdown) already sees the demo as stopped.
  const demoRunningRef = useRef(state.demoRunning);
  demoRunningRef.current = state.demoRunning;
  const onDemoSelectRef = useRef(onDemoSelect);
  onDemoSelectRef.current = onDemoSelect;

  useEffect(() => {
    dispatch({ type: 'reset', init: { enabled, isFirstCategory, reducedMotion } });
  }, [enabled, isFirstCategory, reducedMotion, resetKey]);

  // The self-demo loop.
  useEffect(() => {
    if (!state.demoRunning || !stripReady) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const events = buildDemoLoop(baseIndex, stepsLength);
    const runLoop = (startIn: number) => {
      for (const ev of events) {
        timers.push(setTimeout(() => {
          if (!demoRunningRef.current) return;
          if (ev.kind === 'finger') setFingerRun((n) => n + 1);
          else onDemoSelectRef.current(ev.index);
        }, startIn + ev.at));
      }
      timers.push(setTimeout(() => runLoop(0), startIn + DEMO_LOOP_MS));
    };
    runLoop(DEMO_START_DELAY_MS);
    return () => timers.forEach(clearTimeout);
  }, [state.demoRunning, stripReady, baseIndex, stepsLength]);

  // Later categories: one nudge.
  useEffect(() => {
    if (state.nudge !== 'pending' || !stripReady) return;
    const t = setTimeout(() => dispatch({ type: 'nudgeStart' }), NUDGE_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.nudge, stripReady]);
  useEffect(() => {
    if (state.nudge !== 'running') return;
    const t = setTimeout(() => dispatch({ type: 'nudgeDone' }), NUDGE_MS);
    return () => clearTimeout(t);
  }, [state.nudge]);

  // The light "after" line fades on its own.
  useEffect(() => {
    if (state.pill !== 'after') return;
    const t = setTimeout(() => dispatch({ type: 'afterTimeout' }), AFTER_PILL_MS);
    return () => clearTimeout(t);
  }, [state.pill]);

  const interact = useCallback((kind: InteractionKind = 'press') => {
    demoRunningRef.current = false;
    dispatch({ type: 'interact', kind, at: Date.now() });
  }, []);

  const isDemoRunning = useCallback(() => demoRunningRef.current, []);

  return {
    ...stripHintView(state),
    enabled: state.mode !== 'off',
    reducedMotion,
    fingerRun,
    interact,
    isDemoRunning,
  };
}
