/**
 * sequencer.types — the hybrid run + strength sequencer's vocabulary.
 *
 * The sequencer is a layer ON TOP of the existing hybrid orchestrator
 * (hybrid/hybrid-orchestrator.ts): the orchestrator's state (`inner`) keeps
 * owning the plan cursor and the per-segment actuals that become
 * `workouts/{id}.segments[]`; the sequencer adds what the live screens need
 * around it — geofence arrival, the transition countdown, per-set station
 * logging, the cool-down label and per-leg results.
 */
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import type { HybridRunState } from '../../hybrid/hybrid-orchestrator';
import type { ArrivalConfig, ArrivalState, GeoFix } from './arrival-detector';
import type { StationSetInput } from './station-log';

/** run = an aerobic leg to a station (or a plan with no station); cooldown = the leg after the last station. */
export type SequencerPhase = 'idle' | 'run' | 'transition' | 'station' | 'cooldown' | 'done';

export interface SequencerOptions {
  /** Transition countdown before the station auto-starts (F-2c: 0:20). 0 = start at once. */
  transitionSec: number;
  /** "+20 שנ׳ מנוחה". */
  extendSec: number;
  /** Geofence tuning (defaults per leg type). */
  arrival?: Partial<ArrivalConfig>;
}

export const DEFAULT_SEQUENCER_OPTIONS: SequencerOptions = Object.freeze({ transitionSec: 20, extendSec: 20 }) as SequencerOptions;

export interface TransitionState {
  startedAtMs: number;
  /** Wall ms when the station auto-starts (null while paused). */
  endsAtMs: number | null;
  /** Remaining ms frozen by a pause. */
  pausedRemainingMs: number | null;
  extensions: number;
}

export type ArrivalSource = 'geofence' | 'route_km' | 'manual';

export interface SequencerState {
  inner: HybridRunState;
  phase: SequencerPhase;
  options: SequencerOptions;
  /** Detector for the leg in progress (reset on every new leg). */
  arrival: ArrivalState;
  transition: TransitionState | null;
  /** Station logs being built, by plan index. */
  stationLogs: Record<number, SegmentExerciseDetail[]>;
  /** Seconds spent in the transition before each station, by plan index. */
  transitionSec: Record<number, number>;
  arrivedBy: Record<number, ArrivalSource>;
  /** Last run progress seen (cumulative over the session; the run clock pauses at stations). */
  lastRun: { cumulativeKm: number; elapsedSec: number };
  paused: boolean;
  log: string[];
}

export type SequencerEvent =
  | { type: 'START'; atMs: number }
  /** Live run progress from the running player, with the latest GPS fix when there is one. */
  | { type: 'RUN_TICK'; atMs: number; cumulativeKm: number; elapsedSec: number; fix?: GeoFix | null }
  /** "הגעתי" — manual arrival, works with or without GPS. */
  | { type: 'ARRIVE_MANUAL'; atMs: number }
  /** Clock tick (transition auto-start). */
  | { type: 'TICK'; atMs: number }
  | { type: 'EXTEND_TRANSITION'; atMs: number }
  /** "התחל עכשיו" / "התחל בלוק כוח". */
  | { type: 'START_STATION'; atMs: number }
  | { type: 'PAUSE'; atMs: number }
  | { type: 'RESUME'; atMs: number }
  /** "סיימתי סט" with the reps. */
  | ({ type: 'SET_DONE'; atMs: number } & StationSetInput)
  /** Station finished. A log from the strength player wins over the SET_DONE log. */
  | { type: 'STATION_DONE'; atMs: number; exerciseLog?: SegmentExerciseDetail[]; completedSets?: number }
  /** "דלג" — from the transition or the station. */
  | { type: 'SKIP_STATION'; atMs: number }
  /** End the session (final leg done, or ended early). */
  | { type: 'FINISH'; atMs: number; cumulativeKm?: number; elapsedSec?: number };
