/**
 * tabata.machine — work/rest is purely time-driven; the only user input is
 * an optional reps entry per interval (reps exercises). Board A-1.
 */
import { activeMsAt, freezeClock } from './timed-clock';
import { cleanReps, ignored, withLog } from './timed-common';
import { buildTabataIntervals, tabataPositionAt, tabataTotalMs } from './tabata-schedule';
import type { TabataData, TabataState, TimedBlockSpec, TimedEvent } from './timed.types';

export function initTabataData(spec: Extract<TimedBlockSpec, { format: 'tabata' }>): TabataData {
  const intervals = buildTabataIntervals(spec.items, spec.config);
  return { intervals, reps: intervals.map(() => null) };
}

export function tabataTotal(state: TabataState): number {
  return tabataTotalMs(state.spec.config, state.data.intervals.length);
}

/** Apply time-driven transitions up to `atMs` (block end). */
export function syncTabata(state: TabataState, atMs: number): TabataState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  const total = tabataTotal(state);
  if (activeMsAt(state.clock, atMs) < total) return state;
  return withLog({ ...state, status: 'done', clock: freezeClock(state.clock, total, atMs) }, 'tabata: all intervals done');
}

export function reduceTabata(state: TabataState, event: TimedEvent): TabataState {
  switch (event.type) {
    case 'LOG_REPS': {
      if (state.status === 'idle') return ignored(state, event.type);
      const reps = cleanReps(event.reps);
      const pos = tabataPositionAt(state.spec.config, state.data.intervals.length, activeMsAt(state.clock, event.atMs));
      const index = event.index ?? pos.index;
      if (reps == null || index < 0 || index >= state.data.intervals.length) return ignored(state, event.type);
      // Cannot log an interval that has not started yet.
      if (state.status !== 'done' && index > pos.index) return ignored(state, event.type);
      const next = state.data.reps.slice();
      next[index] = reps;
      return withLog({ ...state, data: { ...state.data, reps: next } }, `tabata: interval ${index + 1} reps=${reps}`);
    }
    case 'ITEM_DONE':
    case 'AEROBIC_PROGRESS':
      // Tabata is clock-driven: "done" taps and GPS do not move it.
      return ignored(state, event.type);
    case 'FINISH': {
      if (state.status !== 'running' && state.status !== 'paused') return ignored(state, event.type);
      const active = activeMsAt(state.clock, event.atMs);
      return withLog({ ...state, status: 'done', clock: freezeClock(state.clock, active, event.atMs) }, 'tabata: finished early');
    }
    default:
      return state;
  }
}
