'use client';

/**
 * useTimedSegment — runs the CURRENT segment of a strength workout on the
 * timed engine when it is an AMRAP / EMOM / Tabata block (enable_home_v2).
 *
 * - `active` is false for every other segment (and always with the flag off
 *   or inside a hybrid station) → the strength player renders exactly what
 *   it renders today.
 * - Pause follows the player's own pause (the header button / the pause
 *   overlay), except the automatic background pause: the engine's clock is
 *   wall-time based, so a block keeps its true position in the background.
 * - When the block is done and no "how many reps?" prompt is open, the
 *   result is handed back as the segment's log rows (`onHandBack`), after a
 *   short "block done" moment.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { createMonotonicNow } from '@/features/workout-engine/engines/clock';
import { useTimedBlock } from '@/features/workout-engine/engines/hooks/useTimedBlock';
import { reduceTimed } from '@/features/workout-engine/engines/timed/timed-machine';
import { buildTimedResult, type TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { TimedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import type { TimedBlockSpec, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import {
  resolveTimedSegment,
  segmentLogId,
  timedBlockPrefix,
  timedResultToLog,
  timedSegmentKey,
} from '../logic/timed-segment';
import { pendingPrompt, readyToHandBack, type TimedPrompt } from '../logic/timed-prompt';
import { useTimedCueSound } from './useTimedCueSound';
import { useRunLegGps } from './useRunLegGps';

/** How long the "block done" card stays before the workout moves on. */
export const DONE_HOLD_MS = 1600;

export interface UseTimedSegmentInput {
  workout: WorkoutPlan;
  segmentIndex: number;
  /** enable_home_v2 */
  enabled: boolean;
  /** Inside a hybrid station — never timed here. */
  embedded: boolean;
  /** The strength player's pause. */
  isPaused: boolean;
  onHandBack: (entries: ExerciseResultLog[]) => void;
}

export interface TimedSegmentApi {
  active: boolean;
  spec: TimedBlockSpec | null;
  state: TimedState | null;
  view: TimedView | null;
  prompt: TimedPrompt | null;
  /** "פינישר" in a mixed workout, else null. */
  prefix: string | null;
  /** Final result once the block is done (for the "block done" card). */
  result: TimedBlockResult | null;
  /** Live distance of a run item (metres). */
  runDistanceM: number;
  start: () => void;
  itemDone: () => void;
  answerPrompt: (reps: number) => void;
  skipPrompt: () => void;
  /** Early exit: stop the block now and return its rows (empty when it never started). */
  finishNow: () => ExerciseResultLog[];
}

export function useTimedSegment({ workout, segmentIndex, enabled, embedded, isPaused, onHandBack }: UseTimedSegmentInput): TimedSegmentApi {
  const segment = workout.segments[segmentIndex];
  const key = timedSegmentKey(segment);
  // Memoised on the content key, not the object: a rebuilt plan never restarts a running block.
  const spec = useMemo(
    () => resolveTimedSegment(segment, { enabled, embedded }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled, embedded],
  );
  const now = useMemo(() => createMonotonicNow(), []);
  const playCue = useTimedCueSound();
  const block = useTimedBlock(spec, { enabled: !!spec, onCue: playCue, now });
  const { dispatch } = block;
  // For one render after the segment changes, the hook still holds the previous block's state
  // (it re-inits in an effect). Never read it against the new spec — a finished block would
  // otherwise be handed back a second time for the next segment.
  const fresh = !!spec && block.state?.spec === spec;
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
    };
  }, [spec]);

  const prompt = useMemo(() => pendingPrompt(state, asked, view?.activeMs ?? 0), [state, asked, view?.activeMs]);
  const result = useMemo(() => (state?.status === 'done' ? buildTimedResult(state) : null), [state]);

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
    if (!spec || !result || handedRef.current || !readyToHandBack(state, prompt)) return;
    handedRef.current = true;
    const entries = timedResultToLog(result, segment, segmentLogId(workout, segmentIndex));
    pendingRows.current = entries;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      pendingRows.current = null;
      onHandBackRef.current(entries);
    }, DONE_HOLD_MS);
  }, [spec, result, state, prompt, segment, workout, segmentIndex]);

  // Run item inside a round: GPS distance while it is current.
  const runKey =
    view && view.current?.kind === 'aerobic_leg' && (view.phase === 'aerobic' || view.phase === 'paused')
      ? `${view.round}-${view.current.key}`
      : null;
  const onDistance = useCallback((distanceM: number) => dispatch({ type: 'AEROBIC_PROGRESS', distanceM }), [dispatch]);
  const runDistanceM = useRunLegGps(runKey, onDistance);

  const start = useCallback(() => dispatch({ type: 'START' }), [dispatch]);
  const itemDone = useCallback(() => dispatch({ type: 'ITEM_DONE' }), [dispatch]);

  const markAsked = useCallback((i: number) => setAsked((prev) => new Set(prev).add(i)), []);
  const answerPrompt = useCallback(
    (reps: number) => {
      if (!prompt) return;
      if (prompt.kind === 'amrap_partial') dispatch({ type: 'LOG_REPS', reps });
      else {
        dispatch({ type: 'LOG_REPS', reps, index: prompt.minuteIndex });
        markAsked(prompt.minuteIndex);
      }
    },
    [prompt, dispatch, markAsked],
  );
  const skipPrompt = useCallback(() => {
    if (!prompt) return;
    if (prompt.kind === 'amrap_partial') dispatch({ type: 'FINISH' });
    else markAsked(prompt.minuteIndex);
  }, [prompt, dispatch, markAsked]);

  const finishNow = useCallback((): ExerciseResultLog[] => {
    if (holdTimer.current && pendingRows.current) {
      // Exit during the "block done" moment: take the rows now, no second hand-back.
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      const rows = pendingRows.current;
      pendingRows.current = null;
      return rows;
    }
    if (!spec || !state || state.status === 'idle' || handedRef.current) return [];
    const at = now();
    let s = state.status === 'done' ? state : reduceTimed(state, { type: 'FINISH', atMs: at });
    if (s.status === 'awaiting_partial') s = reduceTimed(s, { type: 'FINISH', atMs: at });
    if (s.status !== 'done') return [];
    handedRef.current = true;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    return timedResultToLog(buildTimedResult(s), segment, segmentLogId(workout, segmentIndex));
  }, [spec, state, now, segment, workout, segmentIndex]);

  const prefix = useMemo(() => (spec ? timedBlockPrefix(workout, segmentIndex) : null), [spec, workout, segmentIndex]);

  return {
    active: !!spec,
    spec,
    state,
    view,
    prompt,
    prefix,
    result,
    runDistanceM,
    start,
    itemDone,
    answerPrompt,
    skipPrompt,
    finishNow,
  };
}
