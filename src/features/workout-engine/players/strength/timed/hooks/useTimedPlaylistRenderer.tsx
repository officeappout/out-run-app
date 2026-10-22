'use client';

/**
 * useTimedPlaylistRenderer — WorkoutPlaylist's renderer for timed segments
 * (enable_home_v2): returns a function segmentIndex → <TimedPlaylistCard> for
 * an AMRAP / EMOM / Tabata segment, null for everything else. Returns
 * undefined with the flag off / in a hybrid station → the playlist is today's.
 */
import React, { useCallback, useMemo } from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import { resolveTimedSegment, segmentLogId } from '../logic/timed-segment';
import { timedPlaylistModel } from '../logic/timed-playlist';
import { timedResultsFor } from '../state/timed-results';
import TimedPlaylistCard from '../components/TimedPlaylistCard';
import { useStrengthDrawerV1 } from '../../hooks/useStrengthDrawerV1';

export function useTimedPlaylistRenderer(
  workout: WorkoutPlan,
  gate: { enabled: boolean; embedded: boolean },
  currentSegmentIndex: number,
  log: readonly ExerciseResultLog[],
): ((segmentIndex: number) => React.ReactNode | null) | undefined {
  const specs = useMemo(
    () => workout.segments.map((s) => resolveTimedSegment(s, gate)),
    [workout, gate.enabled, gate.embedded], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const any = specs.some(Boolean);
  // enable_strength_drawer_v1: each exercise row gets "פרטי התרגיל" (the plan exercise behind it).
  const rowDetailsV1 = useStrengthDrawerV1();
  const render = useCallback(
    (segmentIndex: number) => {
      const spec = specs[segmentIndex];
      if (!spec) return null;
      const id = segmentLogId(workout, segmentIndex);
      const status = segmentIndex < currentSegmentIndex ? 'done' : segmentIndex === currentSegmentIndex ? 'active' : 'upcoming';
      const result = timedResultsFor([id])[0]?.result ?? null;
      const model = timedPlaylistModel(spec, status, log.filter((e) => e.segmentId === id), result);
      const planList = workout.segments[segmentIndex]?.exercises ?? [];
      const details = rowDetailsV1
        ? spec.items.map((it) => (it.kind === 'exercise' ? planList.find((e) => e.id === it.exerciseId) ?? null : null))
        : undefined;
      return <TimedPlaylistCard model={model} details={details} />;
    },
    [specs, workout, currentSegmentIndex, log, rowDetailsV1],
  );
  return any ? render : undefined;
}
