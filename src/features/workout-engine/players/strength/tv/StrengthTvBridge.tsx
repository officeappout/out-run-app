'use client';

/**
 * StrengthTvBridge — mounts TV mode into the strength player (enable_tv_mode_v1). Renders nothing.
 *
 * StrengthRunner mounts it (lazily, only with the flag on and not in a hybrid station). It does nothing
 * until this phone is connected to a TV session: the outer gate only watches the connection role. Then the
 * runner's state becomes a RunnerSnapshot → throttled mirror for the TV (host) or progress for the friends
 * row (participant), and the phone remote's buttons are wired to the runner's own actions.
 */
import { useMemo, useRef, useSyncExternalStore } from 'react';
import type { WorkoutPlan } from '@/features/parks';
import { useTvPhoneStore } from '@/features/tv-mode/phone/phone-store';
import { useTvRunner } from '@/features/tv-mode/hooks/useTvRunner';
import type { RunnerActions } from '@/features/tv-mode/core/runner-controls';
import type { TvMedia } from '@/features/tv-mode/core/types';
import type { WorkoutStateMachineResult } from '../hooks/useWorkoutStateMachine';
import type { TimedSegmentGate } from '../timed';
import { useCardClockStore } from './card-clock';
import { buildStrengthSnapshot, tvMediaFor } from './strength-snapshot';
import { buildTimedSnapshot } from './timed-snapshot';

export interface StrengthTvBridgeProps {
  sm: WorkoutStateMachineResult;
  workout: WorkoutPlan;
  timed: TimedSegmentGate;
  /** The INPUT screen's "save" (lives in the runner, next to its pickers). */
  onSaveInput: () => void;
}

export default function StrengthTvBridge(props: StrengthTvBridgeProps) {
  const role = useTvPhoneStore((s) => s.role);
  if (!role) return null;
  return props.timed.active ? <TimedBridge {...props} /> : <ClassicBridge {...props} />;
}

function ClassicBridge({ sm, workout, onSaveInput }: StrengthTvBridgeProps) {
  const card = useCardClockStore((s) => s.report);
  const isTabata = sm.blockProtocol?.id === 'tabata';
  const clockDriven = (sm.exerciseType === 'time' && !sm.isFollowAlongMode) || isTabata;

  const media = useMemo(
    () => tvMediaFor({ videoUrl: sm.exerciseVideoUrl, bunnyVideoId: sm.exerciseBunnyVideoId, imageUrl: sm.activeExercise?.imageUrl }),
    [sm.exerciseVideoUrl, sm.exerciseBunnyVideoId, sm.activeExercise?.imageUrl],
  );
  const nextMedia = useMemo(
    () => tvMediaFor({ videoUrl: sm.nextExercise.videoUrl, bunnyVideoId: sm.nextExercise.bunnyVideoId, imageUrl: sm.nextExercise.imageUrl }),
    [sm.nextExercise.videoUrl, sm.nextExercise.bunnyVideoId, sm.nextExercise.imageUrl],
  );

  // Longest rest of this RESTING stretch = the progress bar's total.
  const restTotal = useRef(0);
  if (sm.workoutState !== 'RESTING') restTotal.current = 0;
  else restTotal.current = Math.max(restTotal.current, sm.restTimeLeft);

  const snapshot = buildStrengthSnapshot({
    nowMs: Date.now(),
    workoutState: sm.workoutState,
    paused: sm.isPaused,
    segmentIndex: sm.currentSegmentIndex,
    exerciseIndex: sm.currentExerciseIndex,
    segmentSizes: workout.segments.map((s) => s.exercises?.length ?? 0),
    exerciseId: sm.activeExercise?.id,
    exerciseName: sm.exerciseName,
    nextName: sm.nextExercise.name,
    round: sm.currentRound,
    totalRounds: sm.totalRounds,
    repsMin: sm.repsRangeMin ?? undefined,
    repsMax: sm.repsRangeMax ?? undefined,
    targetReps: sm.targetReps,
    clockDriven,
    durationSec: sm.exerciseDuration,
    isTabata,
    restLeftSec: sm.restTimeLeft,
    restTotalSec: restTotal.current,
    card,
    media,
    nextMedia,
  });

  const latest = useRef(sm);
  latest.current = sm;
  const saveInput = useRef(onSaveInput);
  saveInput.current = onSaveInput;
  const actions = useRef<RunnerActions>({
    togglePause: () => latest.current.togglePause(),
    next: () => {
      const s = latest.current;
      if (s.workoutState === 'RESTING') s.skipRest();
      else if (s.workoutState === 'INPUT') saveInput.current();
      else if (s.workoutState === 'ACTIVE') s.handleExerciseComplete();
    },
  });
  useTvRunner(snapshot, actions.current);
  return null;
}

function TimedBridge({ sm, workout, timed }: StrengthTvBridgeProps) {
  const snap = useSyncExternalStore(timed.store.subscribe, timed.store.getSnapshot, () => null);
  const segmentIndex = sm.currentSegmentIndex;
  const mediaFor = useMemo(() => {
    const exercises = (workout.segments[segmentIndex]?.exercises ?? []) as Array<{ id?: string; videoUrl?: string | null; bunnyVideoId?: string | null; imageUrl?: string | null }>;
    return (exerciseId: string | undefined, imageUrl: string | undefined): TvMedia | undefined => {
      const ex = exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined;
      return tvMediaFor({ videoUrl: ex?.videoUrl, bunnyVideoId: ex?.bunnyVideoId, imageUrl: ex?.imageUrl ?? imageUrl });
    };
  }, [workout, segmentIndex]);

  const snapshot = snap ? buildTimedSnapshot({ snapshot: snap, segmentIndex, paused: sm.isPaused, mediaFor }) : null;

  const latest = useRef({ sm, timed });
  latest.current = { sm, timed };
  const actions = useRef<RunnerActions>({
    togglePause: () => latest.current.sm.togglePause(),
    next: () => latest.current.timed.store.actions.itemDone(),
  });
  useTvRunner(snapshot, actions.current);
  return null;
}
