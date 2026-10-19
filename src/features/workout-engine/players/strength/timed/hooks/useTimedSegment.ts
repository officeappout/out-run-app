'use client';

/**
 * useTimedSegment — the ONLY timed hook the strength player root calls.
 * Cheap and tick-free: it decides whether the current segment is a timed
 * block (enable_home_v2; never in a hybrid station) and owns one stable
 * TimedStore. The engine itself runs in <TimedRuntime> (a leaf), and the
 * screens subscribe to the store — so the root never re-renders per tick.
 */
import { useEffect, useMemo, useState } from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { resolveTimedSegment, timedSegmentKey } from '../logic/timed-segment';
import { createTimedStore, type TimedStore } from '../state/timed-store';
import { beginTimedSession } from '../state/timed-results';

export interface TimedSegmentGate {
  active: boolean;
  spec: TimedBlockSpec | null;
  store: TimedStore;
}

export function useTimedSegment(input: { workout: WorkoutPlan; segmentIndex: number; enabled: boolean; embedded: boolean }): TimedSegmentGate {
  const { workout, segmentIndex, enabled, embedded } = input;
  const segment = workout.segments[segmentIndex];
  const key = timedSegmentKey(segment);
  // Memoised on the content key, not the object: a rebuilt plan never restarts a running block.
  const spec = useMemo(
    () => resolveTimedSegment(segment, { enabled, embedded }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled, embedded],
  );
  const [store] = useState(createTimedStore);
  useEffect(() => {
    if (enabled && !embedded) beginTimedSession(workout.id);
  }, [enabled, embedded, workout.id]);
  return useMemo(() => ({ active: !!spec, spec, store }), [spec, store]);
}
