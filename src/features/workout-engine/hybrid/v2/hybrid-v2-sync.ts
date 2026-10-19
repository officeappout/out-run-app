/**
 * hybrid-v2-sync — how the home-v2 hybrid player keeps the two runtimes in
 * step (pure).
 *
 * The v2 player runs the hybrid SEQUENCER (engines/hybrid) for everything
 * the screens show: legs, geofence arrival, the transition countdown,
 * per-leg results, and the saved result (via useHybridRun's finalize
 * override). useHybridRun stays the runtime of the station itself
 * (StrengthRunner, the run-clock pause, the save + completion sync).
 *
 *   sequencer → legacy : the sequencer arrived (geofence / "הגעתי" /
 *                        route-km) → useHybridRun.arrive() (pauses the run
 *                        clock, mounts the station plan).
 *   legacy → sequencer : useHybridRun closed the station (StrengthRunner
 *                        done, or "דלג" on the station screen) → the
 *                        matching STATION_DONE / SKIP_STATION.
 */
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import type { HybridPhase, HybridSegmentActual } from '../hybrid-orchestrator';
import { countDoneSets } from '../../engines/hybrid/station-log';
import type { SequencerPhase } from '../../engines/hybrid/sequencer.types';

/** The sequencer events the sync can emit (the hook stamps atMs). */
export type SyncEvent =
  | { type: 'START' }
  | { type: 'START_STATION' }
  | { type: 'SKIP_STATION' }
  | { type: 'STATION_DONE'; exerciseLog: SegmentExerciseDetail[]; completedSets: number };

const atStation = (p: SequencerPhase) => p === 'transition' || p === 'station';

/** The legacy session already runs but the sequencer has not started yet. */
export function needsSequencerStart(seq: SequencerPhase | null, legacy: HybridPhase, legacyActive: boolean): boolean {
  return seq === 'idle' && legacyActive && (legacy === 'aerobic' || legacy === 'station');
}

/** The sequencer reached a station that useHybridRun has not entered yet. */
export function needsLegacyArrive(seq: SequencerPhase | null, legacy: HybridPhase): boolean {
  return seq != null && atStation(seq) && legacy === 'aerobic';
}

/**
 * useHybridRun just left the station (`prevLegacy` was 'station'): the
 * events that close the same station in the sequencer, from the actual the
 * controller recorded for it. Nothing when the sequencer already moved on
 * (it was the one that skipped / finished).
 */
export function stationCloseEvents(
  seq: SequencerPhase | null,
  prevLegacy: HybridPhase,
  legacy: HybridPhase,
  actual: HybridSegmentActual | undefined,
): SyncEvent[] {
  if (prevLegacy !== 'station' || legacy === 'station') return [];
  if (seq == null || !atStation(seq) || !actual) return [];
  if (actual.skipped) return [{ type: 'SKIP_STATION' }];
  if (!actual.completed) return [];
  const exerciseLog = actual.exerciseLog ?? [];
  const done: SyncEvent = { type: 'STATION_DONE', exerciseLog, completedSets: countDoneSets(exerciseLog) };
  // A station closed while the countdown still showed: start it, then close it (0 s of work).
  return seq === 'transition' ? [{ type: 'START_STATION' }, done] : [done];
}
