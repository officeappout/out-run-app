/**
 * hybrid-sequencer — run leg → arrival → transition → strength station →
 * run leg → … → cool-down → done (boards F-2*, F-3*, U-D1..D4). Pure reducer.
 *
 * Fits the existing model: the composed HybridPlannedSegment[] is the input,
 * the existing orchestrator reducer (`hybridReduce`) is driven underneath
 * and stays the single source of the persisted SessionSegmentRecord[]
 * (`finalizeHybridRun`). This file only decides WHEN to send it which event.
 */
import {
  hybridReduce,
  initHybridRun,
  shouldArriveAtStation,
  type HybridRunState,
} from '../../hybrid/hybrid-orchestrator';
import type { HybridPlannedSegment } from '../../hybrid/compose-hybrid-session.service';
import { arrivalConfigFor, distanceToM, initArrival, stepArrival } from './arrival-detector';
import { addStationSet, countDoneSets } from './station-log';
import {
  DEFAULT_SEQUENCER_OPTIONS,
  type ArrivalSource,
  type SequencerEvent,
  type SequencerOptions,
  type SequencerPhase,
  type SequencerState,
} from './sequencer.types';

// ── helpers ────────────────────────────────────────────────────────────────

function withLog(s: SequencerState, line: string): SequencerState {
  return { ...s, log: [...s.log, line] };
}

function ignored(s: SequencerState, type: string): SequencerState {
  return withLog(s, `ignored ${type} in ${s.phase}`);
}

/** True when a strength segment comes after plan index `i`. */
function stationAfter(plan: readonly HybridPlannedSegment[], i: number): boolean {
  return plan.slice(i + 1).some((s) => s.kind === 'strength');
}

function stationBefore(plan: readonly HybridPlannedSegment[], i: number): boolean {
  return plan.slice(0, i).some((s) => s.kind === 'strength');
}

/** Sequencer phase for the orchestrator's current position. */
export function phaseFromInner(inner: HybridRunState): SequencerPhase {
  if (inner.phase === 'idle') return 'idle';
  if (inner.phase === 'done') return 'done';
  if (inner.phase === 'station') return 'station';
  const i = inner.cursor;
  return !stationAfter(inner.plan, i) && stationBefore(inner.plan, i) ? 'cooldown' : 'run';
}

/** The station right after the current aerobic leg, if any. */
export function nextStation(s: SequencerState): HybridPlannedSegment | null {
  if (s.inner.phase !== 'aerobic') return null;
  const next = s.inner.plan[s.inner.cursor + 1];
  return next && next.kind === 'strength' ? next : null;
}

function legKind(s: SequencerState): 'walking' | 'running' {
  return s.inner.plan[s.inner.cursor]?.aerobicType === 'walking' ? 'walking' : 'running';
}

/** Move on from the orchestrator's new position (new leg → fresh detector). */
function settle(s: SequencerState, inner: HybridRunState, line: string): SequencerState {
  const phase = phaseFromInner(inner);
  return withLog({ ...s, inner, phase, arrival: initArrival(), transition: null }, `${line} → ${phase}`);
}

// ── init ───────────────────────────────────────────────────────────────────

export function initSequencer(plan: HybridPlannedSegment[], options: Partial<SequencerOptions> = {}): SequencerState {
  return {
    inner: initHybridRun(plan),
    phase: 'idle',
    options: { ...DEFAULT_SEQUENCER_OPTIONS, ...options },
    arrival: initArrival(),
    transition: null,
    stationLogs: {},
    transitionSec: {},
    arrivedBy: {},
    lastRun: { cumulativeKm: 0, elapsedSec: 0 },
    paused: false,
    log: [],
  };
}

// ── transitions ────────────────────────────────────────────────────────────

function arrive(s: SequencerState, atMs: number, by: ArrivalSource): SequencerState {
  const legIdx = s.inner.cursor;
  const inner = hybridReduce(s.inner, {
    type: 'ARRIVE_STATION',
    cumulativeKm: s.lastRun.cumulativeKm,
    elapsedSec: s.lastRun.elapsedSec,
    atMs,
  });
  const next = settle({ ...s, arrivedBy: { ...s.arrivedBy, [legIdx + 1]: by } }, inner, `arrived (${by})`);
  if (next.phase !== 'station') return next;
  if (!(s.options.transitionSec > 0)) return startStation(next, atMs);
  return {
    ...next,
    phase: 'transition',
    transition: { startedAtMs: atMs, endsAtMs: atMs + s.options.transitionSec * 1000, pausedRemainingMs: null, extensions: 0 },
  };
}

function startStation(s: SequencerState, atMs: number): SequencerState {
  const idx = s.inner.cursor;
  const tSec = s.transition ? Math.max(0, Math.round((atMs - s.transition.startedAtMs) / 1000)) : 0;
  // The station's own clock starts with the strength work, not at arrival.
  const inner: HybridRunState = { ...s.inner, currentStartMs: atMs };
  return withLog(
    { ...s, inner, phase: 'station', transition: null, paused: false, transitionSec: { ...s.transitionSec, [idx]: tSec } },
    `station ${idx} started after ${tSec}s transition`,
  );
}

function closeStation(s: SequencerState, atMs: number, ev?: { exerciseLog?: SequencerState['stationLogs'][number]; completedSets?: number }): SequencerState {
  const idx = s.inner.cursor;
  const exerciseLog = ev?.exerciseLog ?? s.stationLogs[idx] ?? [];
  const completedSets = ev?.completedSets ?? countDoneSets(exerciseLog);
  const inner = hybridReduce(s.inner, { type: 'STATION_DONE', completedSets, actualDurationSec: 0, atMs, exerciseLog });
  return settle({ ...s, stationLogs: { ...s.stationLogs, [idx]: exerciseLog } }, inner, `station ${idx} done (${completedSets} sets)`);
}

function skipStation(s: SequencerState, atMs: number): SequencerState {
  const idx = s.inner.cursor;
  const fromTransition = s.phase === 'transition' && s.transition;
  const withT = fromTransition
    ? { ...s, transitionSec: { ...s.transitionSec, [idx]: Math.max(0, Math.round((atMs - (s.transition as { startedAtMs: number }).startedAtMs) / 1000)) } }
    : s;
  // Skipped from the transition: no strength time at all (0 s), not the countdown.
  const base = fromTransition ? { ...withT.inner, currentStartMs: atMs } : withT.inner;
  const inner = hybridReduce(base, { type: 'STATION_SKIPPED', atMs });
  return settle(withT, inner, `station ${idx} skipped`);
}

function forceDone(s: SequencerState, line: string): SequencerState {
  return withLog({ ...s, inner: { ...s.inner, phase: 'done' }, phase: 'done', transition: null, paused: false }, line);
}

// ── reducer ────────────────────────────────────────────────────────────────

export function reduceSequencer(s: SequencerState, ev: SequencerEvent): SequencerState {
  switch (ev.type) {
    case 'START': {
      if (s.phase !== 'idle') return ignored(s, ev.type);
      return settle(s, hybridReduce(s.inner, { type: 'START', atMs: ev.atMs }), 'START');
    }

    case 'RUN_TICK': {
      if (s.phase !== 'run' && s.phase !== 'cooldown') return s; // run clock is paused off-leg
      const lastRun = { cumulativeKm: Math.max(0, ev.cumulativeKm), elapsedSec: Math.max(0, ev.elapsedSec) };
      const inner = hybridReduce(s.inner, { type: 'AEROBIC_TICK', ...lastRun });
      let next: SequencerState = { ...s, inner, lastRun };
      const station = nextStation(next);
      if (!station) return next;
      if (station.lat != null && station.lng != null) {
        if (!ev.fix) return next;
        const cfg = arrivalConfigFor(legKind(next), next.options.arrival);
        const arrival = stepArrival(next.arrival, distanceToM(ev.fix, { lat: station.lat, lng: station.lng }), ev.fix.accuracyM, cfg);
        next = { ...next, arrival };
        return arrival.arrived ? arrive(next, ev.atMs, 'geofence') : next;
      }
      // No coordinates on the plan: the orchestrator's route-km threshold.
      return shouldArriveAtStation(next.inner, lastRun.cumulativeKm) ? arrive(next, ev.atMs, 'route_km') : next;
    }

    case 'ARRIVE_MANUAL': {
      if (s.phase !== 'run' || !nextStation(s)) return ignored(s, ev.type);
      return arrive(s, ev.atMs, 'manual');
    }

    case 'TICK': {
      const t = s.transition;
      if (s.phase !== 'transition' || !t || t.endsAtMs == null) return s;
      // Back-dated: the station began when the countdown ended, even if this tick is late.
      return ev.atMs >= t.endsAtMs ? startStation(s, t.endsAtMs) : s;
    }

    case 'EXTEND_TRANSITION': {
      const t = s.transition;
      if (s.phase !== 'transition' || !t) return ignored(s, ev.type);
      const add = s.options.extendSec * 1000;
      return withLog(
        {
          ...s,
          transition: {
            ...t,
            endsAtMs: t.endsAtMs != null ? Math.max(t.endsAtMs, ev.atMs) + add : null,
            pausedRemainingMs: t.pausedRemainingMs != null ? t.pausedRemainingMs + add : null,
            extensions: t.extensions + 1,
          },
        },
        `transition +${s.options.extendSec}s`,
      );
    }

    case 'START_STATION': {
      if (s.phase !== 'transition') return ignored(s, ev.type);
      return startStation(s, ev.atMs);
    }

    case 'PAUSE': {
      const t = s.transition;
      if (s.phase !== 'transition' || !t || t.endsAtMs == null) return ignored(s, ev.type);
      return withLog(
        { ...s, paused: true, transition: { ...t, endsAtMs: null, pausedRemainingMs: Math.max(0, t.endsAtMs - ev.atMs) } },
        'transition paused',
      );
    }

    case 'RESUME': {
      const t = s.transition;
      if (s.phase !== 'transition' || !t || t.pausedRemainingMs == null) return ignored(s, ev.type);
      return withLog(
        { ...s, paused: false, transition: { ...t, endsAtMs: ev.atMs + t.pausedRemainingMs, pausedRemainingMs: null } },
        'transition resumed',
      );
    }

    case 'SET_DONE': {
      if (s.phase !== 'station') return ignored(s, ev.type);
      const idx = s.inner.cursor;
      const log = addStationSet(s.stationLogs[idx] ?? [], ev, s.inner.plan[idx]);
      return { ...s, stationLogs: { ...s.stationLogs, [idx]: log } };
    }

    case 'STATION_DONE': {
      if (s.phase !== 'station') return ignored(s, ev.type);
      return closeStation(s, ev.atMs, ev);
    }

    case 'SKIP_STATION': {
      if (s.phase !== 'station' && s.phase !== 'transition') return ignored(s, ev.type);
      return skipStation(s, ev.atMs);
    }

    case 'FINISH': {
      if (s.phase === 'run' || s.phase === 'cooldown') {
        const cumulativeKm = ev.cumulativeKm ?? s.lastRun.cumulativeKm;
        const elapsedSec = ev.elapsedSec ?? s.lastRun.elapsedSec;
        const inner = hybridReduce(s.inner, { type: 'FINISH', cumulativeKm, elapsedSec, atMs: ev.atMs });
        return forceDone({ ...s, inner, lastRun: { cumulativeKm, elapsedSec } }, `FINISH in ${s.phase}`);
      }
      if (s.phase === 'station') return forceDone(closeStation(s, ev.atMs), 'FINISH in station (logged sets kept)');
      if (s.phase === 'transition') return forceDone(skipStation(s, ev.atMs), 'FINISH in transition (station skipped)');
      return ignored(s, ev.type);
    }

    default:
      return s;
  }
}

export function reduceSequencerAll(s: SequencerState, events: readonly SequencerEvent[]): SequencerState {
  return events.reduce(reduceSequencer, s);
}
