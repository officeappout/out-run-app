/**
 * hybrid-session-controller — imperative wrapper over the pure orchestrator
 * (Phase 3b, item 2/3 "orchestrator"). No React, no Firebase — a thin stateful
 * handle a runtime layer (or a test) drives with run/station events. The React
 * mount that feeds it live GPS + StrengthRunner completion is the review gate
 * (it must also suppress useRunningPlayer.finishWorkout's auto-save).
 *
 * finalize() always returns the 3-record shape (legA / station / legB) —
 * the storage decision (no aerobic merge in persistence).
 */

import type { HybridPlannedSegment } from './compose-hybrid-session.service';
import {
  initHybridRun,
  hybridReduce,
  shouldArriveAtStation,
  finalizeHybridRun,
  type HybridRunState,
  type HybridEvent,
  type HybridPhase,
  type HybridFinalizeResult,
} from './hybrid-orchestrator';

export interface HybridControllerHandle {
  getState(): HybridRunState;
  getPhase(): HybridPhase;
  /** The station segment currently active (phase 'station'), else null. */
  getActiveStation(): HybridPlannedSegment | null;
  start(atMs?: number): void;
  /** Feed live run progress; returns true when the station threshold is crossed. */
  tick(cumulativeKm: number, elapsedSec: number): boolean;
  /** Manual "הגעתי" / auto threshold: close the leg, enter the station. */
  arrive(cumulativeKm: number, elapsedSec: number, atMs?: number): void;
  /** StrengthRunner.onComplete → close the station, resume the next leg. */
  completeStation(completedSets: number, actualDurationSec: number, atMs?: number): void;
  /** Final leg finished → session done. */
  finish(cumulativeKm: number, elapsedSec: number, atMs?: number): void;
  /** 3 SessionSegmentRecords + summary (LAW-10 display gate lives in summary). */
  finalize(): HybridFinalizeResult;
}

export function createHybridSessionController(
  segments: HybridPlannedSegment[],
): HybridControllerHandle {
  let state = initHybridRun(segments);
  const apply = (event: HybridEvent): void => {
    state = hybridReduce(state, event);
  };

  return {
    getState: () => state,
    getPhase: () => state.phase,
    getActiveStation: () =>
      state.phase === 'station' ? state.plan[state.cursor] ?? null : null,
    start: (atMs) => apply({ type: 'START', atMs }),
    tick: (cumulativeKm, elapsedSec) => {
      apply({ type: 'AEROBIC_TICK', cumulativeKm, elapsedSec });
      return shouldArriveAtStation(state, cumulativeKm);
    },
    arrive: (cumulativeKm, elapsedSec, atMs) =>
      apply({ type: 'ARRIVE_STATION', cumulativeKm, elapsedSec, atMs }),
    completeStation: (completedSets, actualDurationSec, atMs) =>
      apply({ type: 'STATION_DONE', completedSets, actualDurationSec, atMs }),
    finish: (cumulativeKm, elapsedSec, atMs) =>
      apply({ type: 'FINISH', cumulativeKm, elapsedSec, atMs }),
    finalize: () => finalizeHybridRun(state),
  };
}
