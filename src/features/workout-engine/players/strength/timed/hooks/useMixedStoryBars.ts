'use client';

/**
 * useMixedStoryBars — the classic header's story bars when the workout also
 * has timed blocks (enable_home_v2, board A-5b): a block is ONE wide bar.
 * Returns null (→ the player's own bars, unchanged) when there is no timed
 * block or the flag is off.
 */
import { useMemo } from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { effectiveSetsForExercise } from '../../logic/set-target.utils';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import { resolveTimedSegment, segmentLogId } from '../logic/timed-segment';
import { mixedStoryBars, type MixedBar } from '../logic/timed-header';

export function useMixedStoryBars(
  workout: WorkoutPlan,
  gate: { enabled: boolean; embedded: boolean },
  currentSegmentIndex: number,
  log: readonly ExerciseResultLog[],
): MixedBar[] | null {
  const timedIdx = useMemo(() => {
    const set = new Set<number>();
    workout.segments.forEach((s, i) => {
      if (resolveTimedSegment(s, gate)) set.add(i);
    });
    return set;
  }, [workout, gate.enabled, gate.embedded]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (timedIdx.size === 0) return null;
    return mixedStoryBars(workout, {
      currentSegmentIndex,
      isTimed: (i) => timedIdx.has(i),
      setsOf: (i) => (workout.segments[i]?.exercises ?? []).reduce((a, ex) => a + effectiveSetsForExercise(ex), 0),
      loggedSetsOf: (i) => {
        const id = segmentLogId(workout, i);
        return log.filter((e) => e.segmentId === id).reduce((a, e) => a + e.confirmedReps.length, 0);
      },
    });
  }, [timedIdx, workout, currentSegmentIndex, log]);
}
