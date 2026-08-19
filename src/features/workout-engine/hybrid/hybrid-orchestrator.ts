/**
 * hybrid-orchestrator — the pure state machine that runs a hybrid session
 * (HYBRID_ENGINE_DESIGN.md §5 build item 6, Phase 3a).
 *
 * PURE CORE ONLY (LAW 0): no React, no Firebase, no players, no clock read.
 * It models the progression through a composed HybridPlan —
 *   aerobic leg → station → aerobic leg → … → finalize
 * — as a reducer over events. Time/distance/completion all arrive AS event
 * payloads (never read from Date.now/GPS here), so the machine is deterministic
 * and unit-testable. The runtime layer (Phase 3b) owns the players and feeds it
 * events; slicing the continuous run trace into per-segment actuals happens here.
 *
 * Heavy dependencies are TYPE-ONLY (erased at runtime) — this file loads nothing
 * from the strength engine, the composer, or storage at runtime.
 *
 * OUTPUT: `SessionSegmentRecord[]` byte-compatible with storage.service (design
 * §9) — the runtime writes these straight into `workouts/{id}.segments[]`.
 */

import type { HybridPlannedSegment } from './compose-hybrid-session.service';
import type { SessionSegmentRecord, SegmentMetrics, SegmentExerciseDetail } from '../core/services/storage.service';

// ============================================================================
// STATE + EVENTS
// ============================================================================

export type HybridPhase = 'idle' | 'aerobic' | 'station' | 'done';

/** Per-segment actual, accumulated from events (internal representation). */
export interface HybridSegmentActual {
  durationSec: number;
  distanceKm?: number;
  sets?: number;
  /**
   * Strength station only (F1, 19.08.2026 — "unified workout summary" plan).
   * Full per-exercise/per-set detail, additive alongside `sets` above —
   * never replacing it. Absent when the runtime layer doesn't pass one
   * (e.g. a test replaying raw events with no exerciseLog payload).
   */
  exerciseLog?: SegmentExerciseDetail[];
  completed: boolean;
  startedAtMs?: number;
  endedAtMs?: number;
}

export interface HybridRunState {
  phase: HybridPhase;
  /** Index into `plan` of the segment currently executing. */
  cursor: number;
  plan: HybridPlannedSegment[];
  /** actuals[i] = accumulated result of plan[i] (undefined until touched). */
  actuals: Array<HybridSegmentActual | undefined>;
  /** Cumulative km / run-clock sec at the start of the CURRENT aerobic leg. */
  legBaselineKm: number;
  legBaselineSec: number;
  /** Epoch-ms the current segment started (threaded to SessionSegmentRecord). */
  currentStartMs?: number;
  log: string[];
}

export type HybridEvent =
  | { type: 'START'; atMs?: number }
  /** Live aerobic progress (cumulative over the whole run; run clock pauses at a station). */
  | { type: 'AEROBIC_TICK'; cumulativeKm: number; elapsedSec: number }
  /** Reached the station (distance threshold crossed, or manual "הגעתי" override). */
  | { type: 'ARRIVE_STATION'; cumulativeKm: number; elapsedSec: number; atMs?: number }
  /** Strength block finished (from StrengthRunner.onComplete). */
  | { type: 'STATION_DONE'; completedSets: number; actualDurationSec: number; atMs?: number; exerciseLog?: SegmentExerciseDetail[] }
  /** Final aerobic leg finished → session complete. */
  | { type: 'FINISH'; cumulativeKm: number; elapsedSec: number; atMs?: number };

// ============================================================================
// INIT
// ============================================================================

/** Build the initial (idle) state from a composed plan's segments. */
export function initHybridRun(segments: HybridPlannedSegment[]): HybridRunState {
  return {
    phase: 'idle',
    cursor: 0,
    plan: segments,
    actuals: segments.map(() => undefined),
    legBaselineKm: 0,
    legBaselineSec: 0,
    log: [],
  };
}

/** Phase implied by a segment kind. */
function phaseForKind(kind: HybridPlannedSegment['kind']): HybridPhase {
  return kind === 'strength' ? 'station' : 'aerobic';
}

// ============================================================================
// THRESHOLD (pure helper the runtime calls each tick)
// ============================================================================

/**
 * True when the runner has reached the station that follows the current aerobic
 * leg (decision: distance-threshold arrival, with a manual override event). The
 * threshold is the current aerobic leg's planned `toKm`. Returns false unless a
 * strength segment actually follows.
 */
export function shouldArriveAtStation(state: HybridRunState, cumulativeKm: number): boolean {
  if (state.phase !== 'aerobic') return false;
  const next = state.plan[state.cursor + 1];
  if (!next || next.kind !== 'strength') return false;
  const leg = state.plan[state.cursor];
  const stationKm = leg?.toKm;
  if (stationKm == null) return false;
  return cumulativeKm >= stationKm;
}

// ============================================================================
// REDUCER (pure)
// ============================================================================

function ignore(state: HybridRunState, event: HybridEvent): HybridRunState {
  return { ...state, log: [...state.log, `ignored ${event.type} in phase ${state.phase}`] };
}

/** Fold one event into the state, returning a NEW state (never mutates). */
export function hybridReduce(state: HybridRunState, event: HybridEvent): HybridRunState {
  switch (event.type) {
    case 'START': {
      if (state.phase !== 'idle') return ignore(state, event);
      if (state.plan.length === 0) {
        return { ...state, phase: 'done', log: [...state.log, 'START on empty plan → done'] };
      }
      const first = state.plan[0];
      return {
        ...state,
        phase: phaseForKind(first.kind),
        cursor: 0,
        legBaselineKm: 0,
        legBaselineSec: 0,
        currentStartMs: event.atMs,
        log: [...state.log, `START → ${first.kind} (segment 0)`],
      };
    }

    case 'AEROBIC_TICK': {
      if (state.phase !== 'aerobic') return ignore(state, event);
      const actuals = state.actuals.slice();
      actuals[state.cursor] = {
        durationSec: Math.max(0, event.elapsedSec - state.legBaselineSec),
        distanceKm: Math.max(0, Number((event.cumulativeKm - state.legBaselineKm).toFixed(3))),
        completed: false,
        startedAtMs: state.currentStartMs,
      };
      return { ...state, actuals };
    }

    case 'ARRIVE_STATION': {
      if (state.phase !== 'aerobic') return ignore(state, event);
      const actuals = state.actuals.slice();
      actuals[state.cursor] = {
        durationSec: Math.max(0, event.elapsedSec - state.legBaselineSec),
        distanceKm: Math.max(0, Number((event.cumulativeKm - state.legBaselineKm).toFixed(3))),
        completed: true,
        startedAtMs: state.currentStartMs,
        endedAtMs: event.atMs,
      };
      const nextCursor = state.cursor + 1;
      const next = state.plan[nextCursor];
      if (!next) {
        // Aerobic leg was the last segment — nothing to arrive at; finish here.
        return { ...state, actuals, phase: 'done', log: [...state.log, 'ARRIVE_STATION with no following segment → done'] };
      }
      return {
        ...state,
        actuals,
        cursor: nextCursor,
        phase: phaseForKind(next.kind),
        // Baseline for the NEXT aerobic leg = the run state at arrival (run clock
        // pauses through the station, so the next leg resumes from here).
        legBaselineKm: event.cumulativeKm,
        legBaselineSec: event.elapsedSec,
        currentStartMs: event.atMs,
        log: [...state.log, `ARRIVE_STATION → ${next.kind} (segment ${nextCursor})`],
      };
    }

    case 'STATION_DONE': {
      if (state.phase !== 'station') return ignore(state, event);
      const actuals = state.actuals.slice();
      actuals[state.cursor] = {
        durationSec: Math.max(0, event.actualDurationSec),
        sets: Math.max(0, event.completedSets),
        ...(event.exerciseLog && event.exerciseLog.length > 0 ? { exerciseLog: event.exerciseLog } : {}),
        completed: true,
        startedAtMs: state.currentStartMs,
        endedAtMs: event.atMs,
      };
      const nextCursor = state.cursor + 1;
      const next = state.plan[nextCursor];
      if (!next) {
        return { ...state, actuals, phase: 'done', log: [...state.log, 'STATION_DONE → done (station was last)'] };
      }
      return {
        ...state,
        actuals,
        cursor: nextCursor,
        phase: phaseForKind(next.kind),
        currentStartMs: event.atMs,
        log: [...state.log, `STATION_DONE → ${next.kind} (segment ${nextCursor})`],
      };
    }

    case 'FINISH': {
      if (state.phase !== 'aerobic') return ignore(state, event);
      const actuals = state.actuals.slice();
      actuals[state.cursor] = {
        durationSec: Math.max(0, event.elapsedSec - state.legBaselineSec),
        distanceKm: Math.max(0, Number((event.cumulativeKm - state.legBaselineKm).toFixed(3))),
        completed: true,
        startedAtMs: state.currentStartMs,
        endedAtMs: event.atMs,
      };
      return { ...state, actuals, phase: 'done', log: [...state.log, `FINISH → done (segment ${state.cursor})`] };
    }

    default:
      return state;
  }
}

/** Convenience for tests / batch replay: fold a list of events left-to-right. */
export function hybridReduceAll(state: HybridRunState, events: HybridEvent[]): HybridRunState {
  return events.reduce(hybridReduce, state);
}

// ============================================================================
// FINALIZE — plan + actuals → SessionSegmentRecord[]
// ============================================================================

function midpointPaceMinKm(seg: HybridPlannedSegment): number | undefined {
  const p = seg.targetPaceSecPerKm;
  if (!p) return undefined;
  return Number((((p.min + p.max) / 2) / 60).toFixed(3));
}

/** Planned metrics for one segment (conditional spread — never emit undefined). */
function plannedMetrics(seg: HybridPlannedSegment): SegmentMetrics {
  const m: SegmentMetrics = {};
  if (seg.durationSec != null) m.durationSec = seg.durationSec;
  if (seg.estCalories != null) m.calories = seg.estCalories;
  if (seg.kind === 'aerobic') {
    if (seg.distanceKm != null) m.distanceKm = seg.distanceKm;
    const pace = midpointPaceMinKm(seg);
    if (pace != null) m.paceMinKm = pace;
  } else {
    const exCount = seg.content?.exercises?.length;
    if (exCount != null) m.exercises = exCount;
    if (seg.content?.totalPlannedSets != null) m.sets = seg.content.totalPlannedSets;
  }
  return m;
}

/** Actual metrics for one segment (conditional spread). */
function actualMetrics(kind: HybridPlannedSegment['kind'], a: HybridSegmentActual): SegmentMetrics {
  const m: SegmentMetrics = {};
  if (a.durationSec != null) m.durationSec = a.durationSec;
  if (kind === 'aerobic') {
    if (a.distanceKm != null) m.distanceKm = a.distanceKm;
  } else {
    if (a.sets != null) m.sets = a.sets;
    if (a.exerciseLog && a.exerciseLog.length > 0) m.exerciseLog = a.exerciseLog;
  }
  return m;
}

export interface HybridFinalizeOptions {
  /**
   * Merge ALL aerobic segments into ONE aerobic record (the "run total"), placed
   * first, followed by the strength records in order — so a sandwich finalises to
   * 2 records: run + station. Default false = one record per planned segment
   * (design §9 byte-compat: legA / station / legB = 3 records).
   */
  mergeAerobicLegs?: boolean;
}

export interface HybridRunSummary {
  segmentCount: number;
  completedAerobicSegments: number;
  completedStrengthSegments: number;
  totalActualAerobicSec: number;
  totalActualDistanceKm: number;
  totalStrengthSets: number;
  /** LAW-10 display gate: the 5% bonus needs ≥1 completed aerobic AND strength. */
  bothHalvesCompleted: boolean;
}

export interface HybridFinalizeResult {
  segments: SessionSegmentRecord[];
  summary: HybridRunSummary;
}

function toRecord(seg: HybridPlannedSegment, a: HybridSegmentActual | undefined, index: number): SessionSegmentRecord {
  const rec: SessionSegmentRecord = { index, kind: seg.kind };
  if (seg.kind === 'aerobic' && seg.aerobicType) rec.aerobicType = seg.aerobicType;
  if (seg.parkId) rec.parkId = seg.parkId;
  const planned = plannedMetrics(seg);
  if (Object.keys(planned).length > 0) rec.planned = planned;
  if (a) {
    const actual = actualMetrics(seg.kind, a);
    if (Object.keys(actual).length > 0) rec.actual = actual;
    if (a.startedAtMs != null) rec.startedAtMs = a.startedAtMs;
    if (a.endedAtMs != null) rec.endedAtMs = a.endedAtMs;
  }
  return rec;
}

/**
 * Produce the persisted `SessionSegmentRecord[]` + a summary. Pure — safe to
 * call on any (even mid-run) state; segments without an actual carry `planned`
 * only. `index` is re-numbered 0..n over the emitted records.
 */
export function finalizeHybridRun(
  state: HybridRunState,
  options: HybridFinalizeOptions = {},
): HybridFinalizeResult {
  const summary: HybridRunSummary = {
    segmentCount: 0,
    completedAerobicSegments: 0,
    completedStrengthSegments: 0,
    totalActualAerobicSec: 0,
    totalActualDistanceKm: 0,
    totalStrengthSets: 0,
    bothHalvesCompleted: false,
  };

  // Summary is computed over the RAW per-segment actuals (independent of merge).
  state.plan.forEach((seg, i) => {
    const a = state.actuals[i];
    if (!a?.completed) return;
    if (seg.kind === 'aerobic') {
      summary.completedAerobicSegments += 1;
      summary.totalActualAerobicSec += a.durationSec ?? 0;
      summary.totalActualDistanceKm += a.distanceKm ?? 0;
    } else {
      summary.completedStrengthSegments += 1;
      summary.totalStrengthSets += a.sets ?? 0;
    }
  });
  summary.totalActualDistanceKm = Number(summary.totalActualDistanceKm.toFixed(3));
  summary.bothHalvesCompleted =
    summary.completedAerobicSegments > 0 && summary.completedStrengthSegments > 0;

  const segments: SessionSegmentRecord[] = [];
  if (!options.mergeAerobicLegs) {
    state.plan.forEach((seg, i) => segments.push(toRecord(seg, state.actuals[i], segments.length)));
  } else {
    // Merge ALL aerobic segments into one "run total" record (aerobic legs in a
    // sandwich are NOT adjacent — the station sits between them), then append the
    // strength records in order. Sandwich → 2 records: run + station.
    let plannedDur = 0, plannedDist = 0, plannedCal = 0;
    let actualDur = 0, actualDist = 0;
    let sawAerobic = false, sawAerobicActual = false, allAerobicCompleted = true;
    let aerobicType: 'running' | 'walking' | undefined;
    let startedAtMs: number | undefined;
    let endedAtMs: number | undefined;
    const strengthRecords: SessionSegmentRecord[] = [];

    state.plan.forEach((seg, i) => {
      if (seg.kind === 'strength') {
        strengthRecords.push(toRecord(seg, state.actuals[i], 0)); // re-indexed below
        return;
      }
      sawAerobic = true;
      aerobicType = aerobicType ?? seg.aerobicType;
      plannedDur += seg.durationSec ?? 0;
      plannedDist += seg.distanceKm ?? 0;
      plannedCal += seg.estCalories ?? 0;
      const a = state.actuals[i];
      if (a) {
        sawAerobicActual = true;
        actualDur += a.durationSec ?? 0;
        actualDist += a.distanceKm ?? 0;
        allAerobicCompleted = allAerobicCompleted && a.completed;
        startedAtMs = startedAtMs ?? a.startedAtMs;
        endedAtMs = a.endedAtMs ?? endedAtMs;
      } else {
        allAerobicCompleted = false;
      }
    });

    if (sawAerobic) {
      const rec: SessionSegmentRecord = { index: segments.length, kind: 'aerobic' };
      if (aerobicType) rec.aerobicType = aerobicType;
      rec.planned = { durationSec: plannedDur, distanceKm: Number(plannedDist.toFixed(3)), calories: plannedCal };
      if (sawAerobicActual) {
        rec.actual = { durationSec: actualDur, distanceKm: Number(actualDist.toFixed(3)) };
        if (startedAtMs != null) rec.startedAtMs = startedAtMs;
        if (endedAtMs != null && allAerobicCompleted) rec.endedAtMs = endedAtMs;
      }
      segments.push(rec);
    }
    for (const sr of strengthRecords) segments.push({ ...sr, index: segments.length });
  }

  summary.segmentCount = segments.length;
  return { segments, summary };
}
