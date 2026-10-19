'use client';

import { useMemo } from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import type { PlannedRunEngine } from './usePlannedRunEngine';
import {
  buildBlockRecords,
  resolveBlockTargetPace,
  type PlannedBlockRecord,
} from '../lib/planned-rep-results';

/**
 * Live per-block results of the planned run in progress (home v2 player):
 * every finished block's record (reps AND wrappers, so the session list can
 * show result boxes for warm-up rows too), keyed by block index, plus the
 * last finished REP (the recovery screen's "אחרי חזרה N" chip). Same pure
 * builder as the record saved with the workout.
 */
export function usePlannedLiveResults(engine: Pick<PlannedRunEngine, 'basePace' | 'zones'>) {
  const workout = useRunningPlayer((s) => s.currentWorkout);
  const results = useRunningPlayer((s) => s.plannedBlockResults);
  const { basePace, zones } = engine;

  return useMemo(() => {
    const blocks = workout?.blocks ?? [];
    const resolve = (b: (typeof blocks)[number]) => resolveBlockTargetPace(b, basePace, zones);
    const all = buildBlockRecords(blocks, results, resolve, { workOnly: false });
    const byIndex = new Map<number, PlannedBlockRecord>();
    for (const r of all) byIndex.set(r.blockIndex, r);
    const reps = all.filter((r) => r.rep > 0);
    return { byIndex, reps, lastRep: reps.length > 0 ? reps[reps.length - 1] : null, resolve };
  }, [workout, results, basePace, zones]);
}
