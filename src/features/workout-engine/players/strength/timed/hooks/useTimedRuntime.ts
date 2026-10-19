'use client';

/**
 * useTimedRuntime — drives ONE timed block (AMRAP / EMOM / Tabata) on the
 * engine. Mounted only inside <TimedRuntime> (a leaf that renders null), so
 * the engine's per-tick re-render never reaches the strength player root;
 * everything the screens need is published to the TimedStore.
 *
 * - Pause follows the player's own pause (header button / pause overlay),
 *   except the automatic background pause: the engine's clock is wall-time
 *   based, so a block keeps its true position in the background.
 * - When the block is done and no "how many reps?" prompt is open, the
 *   rows are handed back (`onHandBack`) after a short "block done" moment.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { createMonotonicNow } from '@/features/workout-engine/engines/clock';
import { useTimedBlock } from '@/features/workout-engine/engines/hooks/useTimedBlock';
import { reduceTimed } from '@/features/workout-engine/engines/timed/timed-machine';
import { buildTimedResult, type TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import { segmentLogId, timedBlockPrefix, timedResultToLog } from '../logic/timed-segment';
import { pendingPrompt, readyToHandBack } from '../logic/timed-prompt';
import type { TimedStore } from '../state/timed-store';
import { recordTimedResult } from '../state/timed-results';
import { useTimedCueSound } from './useTimedCueSound';
import { useRunLegGps } from './useRunLegGps';

/** How long the "block done" card stays before the workout moves on. */
export const DONE_HOLD_MS = 1600;

export interface UseTimedRuntimeInput {
  spec: TimedBlockSpec;
  store: TimedStore;
  workout: WorkoutPlan;
  segmentIndex: number;
  /** The strength player's pause. */
  isPaused: boolean;
  onHandBack: (entries: ExerciseResultLog[]) => void;
}

export function useTimedRuntime({ spec, store, workout, segmentIndex, isPaused, onHandBack }: UseTimedRuntimeInput): void {
  const segment = workout.segments[segmentIndex];
  const segId = segmentLogId(workout, segmentIndex);
  const now = useMemo(() => createMonotonicNow(), []);
  const playCue = useTimedCueSound();
  const block = useTimedBlock(spec, { enabled: true, onCue: playCue, now });
  const { dispatch } = block;
  // For one render after the spec changes the engine hook still holds the previous block's
  // state (it re-inits in an effect) — never read it against the new spec.
  const fresh = block.state?.spec === spec;
  const state = fresh ? block.state : null;
  const view = fresh ? block.view : null;

  const [asked, setAsked] = useState<ReadonlySet<number>>(() => new Set());
  const handedRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Rows waiting out the "block done" moment (an early exit then takes them directly). */
  const pendingRows = useRef<ExerciseResultLog[] | null>(null);
  const onHandBackRef = useRef(onHandBack);
  onHandBackRef.current = onHandBack;

  useEffect(() => {
    setAsked(new Set());
    handedRef.current = false;
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      pendingRows.current = null;
    };
  }, [spec]);

  const prompt = useMemo(() => pendingPrompt(state, asked, view?.activeMs ?? 0), [state, asked, view?.activeMs]);
  const result = useMemo<TimedBlockResult | null>(() => (state?.status === 'done' ? buildTimedResult(state) : null), [state]);

  // Player pause → engine pause. The background auto-pause is skipped on purpose (see header).
  const status = state?.status;
  useEffect(() => {
    if (!status) return;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (isPaused && status === 'running' && visible) dispatch({ type: 'PAUSE' });
    else if (!isPaused && status === 'paused') dispatch({ type: 'RESUME' });
  }, [isPaused, status, dispatch]);

  // Done + nothing to ask → hand the rows back after the "block done" moment.
  useEffect(() => {
    if (!result || handedRef.current || !readyToHandBack(state, prompt)) return;
    handedRef.current = true;
    recordTimedResult(segId, result);
    const entries = timedResultToLog(result, segment, segId);
    pendingRows.current = entries;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      pendingRows.current = null;
      onHandBackRef.current(entries);
    }, DONE_HOLD_MS);
  }, [result, state, prompt, segment, segId]);

  // Run item inside a round: GPS distance while it is current.
  const runKey =
    view && view.current?.kind === 'aerobic_leg' && (view.phase === 'aerobic' || view.phase === 'paused')
      ? `${view.round}-${view.current.key}`
      : null;
  const onDistance = useCallback((distanceM: number) => dispatch({ type: 'AEROBIC_PROGRESS', distanceM }), [dispatch]);
  const runDistanceM = useRunLegGps(runKey, onDistance);

  const markAsked = useCallback((i: number) => setAsked((prev) => new Set(prev).add(i)), []);

  const finishNow = useCallback((): ExerciseResultLog[] => {
    if (holdTimer.current && pendingRows.current) {
      // Exit during the "block done" moment: take the rows now, no second hand-back.
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      const rows = pendingRows.current;
      pendingRows.current = null;
      return rows;
    }
    if (!state || state.status === 'idle' || handedRef.current) return [];
    const at = now();
    let s = state.status === 'done' ? state : reduceTimed(state, { type: 'FINISH', atMs: at });
    if (s.status === 'awaiting_partial') s = reduceTimed(s, { type: 'FINISH', atMs: at });
    if (s.status !== 'done') return [];
    handedRef.current = true;
    const r = buildTimedResult(s);
    recordTimedResult(segId, r);
    return timedResultToLog(r, segment, segId);
  }, [state, now, segment, segId]);

  // Stable store actions → the live implementation (bound before paint).
  useLayoutEffect(() => {
    store.bindActions({
      start: () => dispatch({ type: 'START' }),
      itemDone: () => dispatch({ type: 'ITEM_DONE' }),
      answerPrompt: (reps) => {
        if (!prompt) return;
        if (prompt.kind === 'amrap_partial') dispatch({ type: 'LOG_REPS', reps });
        else {
          dispatch({ type: 'LOG_REPS', reps, index: prompt.minuteIndex });
          markAsked(prompt.minuteIndex);
        }
      },
      skipPrompt: () => {
        if (!prompt) return;
        if (prompt.kind === 'amrap_partial') dispatch({ type: 'FINISH' });
        else markAsked(prompt.minuteIndex);
      },
      finishNow,
    });
  }, [store, dispatch, prompt, markAsked, finishNow]);
  useEffect(() => () => store.bindActions(null), [store]);

  const prefix = useMemo(() => timedBlockPrefix(workout, segmentIndex), [workout, segmentIndex]);

  // Publish what the screens render. Only this leaf re-renders per tick.
  useLayoutEffect(() => {
    store.publish(state && view ? { spec, state, view, prompt, prefix, result, runDistanceM } : null);
  }, [store, spec, state, view, prompt, prefix, result, runDistanceM]);
  useEffect(() => () => store.publish(null), [store]);
}
