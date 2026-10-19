/**
 * sequencer.selectors — what the hybrid screens show, and the results (pure).
 *
 *   sequencerView(state, nowMs) — live header / card data for U-D1..D4
 *   legResults(state)           — one row per planned leg (run / station)
 *   finalizeSequencer(state)    — the existing finalizeHybridRun output
 *                                 (SessionSegmentRecord[] + summary), which
 *                                 v2-summary.mapping (hybridRings /
 *                                 hybridStationTables) already reads.
 */
import { finalizeHybridRun, type HybridFinalizeOptions, type HybridFinalizeResult } from '../../hybrid/hybrid-orchestrator';
import type { HybridPlannedSegment } from '../../hybrid/compose-hybrid-session.service';
import type { SegmentExerciseDetail } from '../../core/services/storage.service';
import { legPaceSecPerKm, showsLivePace } from '../leg-pace';
import { countDoneSets } from './station-log';
import { nextStation } from './hybrid-sequencer';
import type { ArrivalSource, SequencerPhase, SequencerState } from './sequencer.types';

const kmToM = (km: number | undefined | null) => (km != null && Number.isFinite(km) ? Math.round(km * 1000) : null);

export interface LegProgress {
  coveredM: number;
  elapsedSec: number;
  targetM: number | null;
  targetSec: number | null;
  remainingM: number | null;
  remainingSec: number | null;
  /** True once the planned distance / time is reached (cool-down: "סיימת"). */
  targetReached: boolean;
  /** Owner rule: no live pace on a leg planned under 400 m. */
  showPace: boolean;
  /** Leg average pace (sec/km), only when the rule allows it. */
  avgPaceSecPerKm: number | null;
}

export interface SequencerView {
  phase: SequencerPhase;
  cursor: number;
  segment: HybridPlannedSegment | null;
  /** The station the current leg leads to. */
  upcomingStation: HybridPlannedSegment | null;
  leg: LegProgress | null;
  /** Real distance to the upcoming station ("650 מ׳ לפארק"), when GPS + coordinates exist. */
  distanceToStationM: number | null;
  approaching: boolean;
  /** The manual "הגעתי" is offered whenever a station follows the leg. */
  canArriveManually: boolean;
  transitionRemainingMs: number | null;
  paused: boolean;
  /** 1-based station number / total ("תחנה 1 מתוך 2"). */
  stationNumber: number | null;
  stationTotal: number;
}

function legTarget(seg: HybridPlannedSegment | undefined) {
  return { distanceM: kmToM(seg?.distanceKm), durationSec: seg?.durationSec ?? null };
}

function legProgress(s: SequencerState): LegProgress | null {
  if (s.phase !== 'run' && s.phase !== 'cooldown') return null;
  const seg = s.inner.plan[s.inner.cursor];
  const a = s.inner.actuals[s.inner.cursor];
  const coveredM = Math.round((a?.distanceKm ?? 0) * 1000);
  const elapsedSec = a?.durationSec ?? 0;
  const t = legTarget(seg);
  const remainingM = t.distanceM != null ? Math.max(0, t.distanceM - coveredM) : null;
  const remainingSec = t.durationSec != null ? Math.max(0, t.durationSec - elapsedSec) : null;
  // A distance target wins over a time target (distance legs carry an estimated duration too).
  const targetReached = t.distanceM != null && t.distanceM > 0 ? coveredM >= t.distanceM : t.durationSec != null && t.durationSec > 0 ? elapsedSec >= t.durationSec : false;
  return {
    coveredM,
    elapsedSec,
    targetM: t.distanceM,
    targetSec: t.durationSec,
    remainingM,
    remainingSec,
    targetReached,
    showPace: showsLivePace(t),
    avgPaceSecPerKm: legPaceSecPerKm(coveredM, elapsedSec, t),
  };
}

function stationIndexes(plan: readonly HybridPlannedSegment[]): number[] {
  return plan.map((p, i) => (p.kind === 'strength' ? i : -1)).filter((i) => i >= 0);
}

export function sequencerView(s: SequencerState, nowMs: number): SequencerView {
  const stations = stationIndexes(s.inner.plan);
  const upcoming = nextStation(s);
  const cur = s.inner.cursor;
  const stationIdx = s.phase === 'station' || s.phase === 'transition' ? cur : upcoming ? cur + 1 : -1;
  const t = s.transition;
  const transitionRemainingMs = t ? (t.pausedRemainingMs ?? Math.max(0, (t.endsAtMs ?? nowMs) - nowMs)) : null;
  return {
    phase: s.phase,
    cursor: cur,
    segment: s.phase === 'idle' || s.phase === 'done' ? null : s.inner.plan[cur] ?? null,
    upcomingStation: upcoming,
    leg: legProgress(s),
    distanceToStationM: upcoming ? s.arrival.distanceM : null,
    approaching: !!upcoming && s.arrival.approaching,
    canArriveManually: s.phase === 'run' && !!upcoming,
    transitionRemainingMs,
    paused: s.paused,
    stationNumber: stationIdx >= 0 && stations.includes(stationIdx) ? stations.indexOf(stationIdx) + 1 : null,
    stationTotal: stations.length,
  };
}

// ── Results per leg ────────────────────────────────────────────────────────

export type LegStatus = 'done' | 'active' | 'skipped' | 'not_reached';

export type LegResult =
  | {
      kind: 'run' | 'cooldown';
      index: number;
      aerobicType: 'running' | 'walking';
      status: LegStatus;
      distanceM: number;
      durationSec: number;
      /** null under 400 m (owner rule) or without enough movement. */
      paceSecPerKm: number | null;
      plannedDistanceM: number | null;
      plannedDurationSec: number | null;
    }
  | {
      kind: 'station';
      index: number;
      status: LegStatus;
      parkId: string | null;
      durationSec: number;
      transitionSec: number | null;
      arrivedBy: ArrivalSource | null;
      sets: number;
      /** Per-set reps for ExerciseSetsTable (stationRows). */
      exerciseLog: SegmentExerciseDetail[];
    };

export function legResults(s: SequencerState): LegResult[] {
  const plan = s.inner.plan;
  const lastStation = Math.max(-1, ...stationIndexes(plan));
  return plan.map((seg, i): LegResult => {
    const a = s.inner.actuals[i];
    const active = s.phase !== 'done' && s.phase !== 'idle' && s.inner.cursor === i;
    const status: LegStatus = a?.skipped ? 'skipped' : a?.completed ? 'done' : active ? 'active' : 'not_reached';
    if (seg.kind === 'strength') {
      const log = a?.exerciseLog ?? s.stationLogs[i] ?? [];
      return {
        kind: 'station',
        index: i,
        status,
        parkId: seg.parkId ?? null,
        durationSec: a?.durationSec ?? 0,
        transitionSec: s.transitionSec[i] ?? null,
        arrivedBy: s.arrivedBy[i] ?? null,
        sets: a?.sets ?? countDoneSets(log),
        exerciseLog: log,
      };
    }
    const distanceM = Math.round((a?.distanceKm ?? 0) * 1000);
    const durationSec = a?.durationSec ?? 0;
    const t = legTarget(seg);
    return {
      kind: lastStation >= 0 && i > lastStation ? 'cooldown' : 'run',
      index: i,
      aerobicType: seg.aerobicType === 'walking' ? 'walking' : 'running',
      status,
      distanceM,
      durationSec,
      paceSecPerKm: legPaceSecPerKm(distanceM, durationSec, t),
      plannedDistanceM: t.distanceM,
      plannedDurationSec: t.durationSec,
    };
  });
}

/** The persisted records + summary — the orchestrator's own finalize, unchanged. */
export function finalizeSequencer(s: SequencerState, options?: HybridFinalizeOptions): HybridFinalizeResult {
  return finalizeHybridRun(s.inner, options);
}
