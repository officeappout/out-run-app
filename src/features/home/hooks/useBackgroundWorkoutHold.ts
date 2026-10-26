'use client';

/**
 * React wrapper of background-workout-hold: the handlers /home gives
 * StatsOverview (instead of the raw setters) and the park preview's begin/end.
 */

import { useCallback, useRef } from 'react';
import { createBackgroundWorkoutHold } from './background-workout-hold';

export function useBackgroundWorkoutHold<W, C>(
  applyWorkout: (workout: W) => void,
  applyControl: (control: C | null) => void,
) {
  const holdRef = useRef(createBackgroundWorkoutHold<W>());
  const onBackgroundWorkout = useCallback((workout: W) => {
    if (holdRef.current.offerWorkout(workout)) applyWorkout(workout);
  }, [applyWorkout]);
  const onBackgroundControl = useCallback((control: C | null) => {
    if (holdRef.current.offerControl()) applyControl(control);
  }, [applyControl]);
  const begin = useCallback(() => holdRef.current.begin(), []);
  const end = useCallback(() => holdRef.current.end(), []);
  return { onBackgroundWorkout, onBackgroundControl, begin, end };
}
