/**
 * timed-machine — the timed-format engine's entry point (pure reducer).
 *
 *   initTimed(spec) → state;  reduceTimed(state, event) → new state
 *
 * Every event first SYNCS the state to its `atMs` (time-driven transitions:
 * tabata intervals ending, EMOM minutes rolling over, the AMRAP cap), then
 * applies the event itself. Because the position is derived from start /
 * pause timestamps, a block that ran in the background is exact after the
 * next event — TICK exists only so the UI can ask "where are we now".
 */
import { activeMsAt, pauseClock, resumeClock, startClock, IDLE_CLOCK, freezeClock } from './timed-clock';
import { ignored, withLog } from './timed-common';
import { initTabataData, reduceTabata, syncTabata, tabataTotal } from './tabata.machine';
import { initEmomData, reduceEmom, syncEmom, emomTotalMs } from './emom.machine';
import { initAmrapData, reduceAmrap, syncAmrap, amrapCapMs } from './amrap.machine';
import type { TimedBlockSpec, TimedEvent, TimedOptions, TimedState } from './timed.types';

export const DEFAULT_TIMED_OPTIONS: Required<TimedOptions> = Object.freeze({
  countdownSec: [3, 2, 1],
  lastSecondsWindowSec: 5,
  emomGraceMs: 1000,
  staleCueMs: 1000,
}) as Required<TimedOptions>;

export function initTimed(spec: TimedBlockSpec, options: TimedOptions = {}): TimedState {
  const base = {
    status: 'idle' as const,
    clock: { ...IDLE_CLOCK },
    options: { ...DEFAULT_TIMED_OPTIONS, ...options },
    log: [] as string[],
  };
  switch (spec.format) {
    case 'tabata':
      return { ...base, spec, data: initTabataData(spec) };
    case 'emom':
      return { ...base, spec, data: initEmomData(spec) };
    case 'amrap':
      return { ...base, spec, data: initAmrapData(spec) };
  }
}

/** Planned block length (AMRAP: the cap). */
export function timedTotalMs(state: TimedState): number {
  switch (state.spec.format) {
    case 'tabata':
      return tabataTotal(state as Extract<TimedState, { spec: { format: 'tabata' } }>);
    case 'emom':
      return emomTotalMs(state as Extract<TimedState, { spec: { format: 'emom' } }>);
    case 'amrap':
      return amrapCapMs(state as Extract<TimedState, { spec: { format: 'amrap' } }>);
  }
}

/** Bring the state up to `atMs` (pure; safe to call on every frame). */
export function syncTimed(state: TimedState, atMs: number): TimedState {
  switch (state.spec.format) {
    case 'tabata':
      return syncTabata(state as Extract<TimedState, { spec: { format: 'tabata' } }>, atMs);
    case 'emom':
      return syncEmom(state as Extract<TimedState, { spec: { format: 'emom' } }>, atMs);
    case 'amrap':
      return syncAmrap(state as Extract<TimedState, { spec: { format: 'amrap' } }>, atMs);
  }
}

function isEmpty(state: TimedState): boolean {
  return state.spec.items.length === 0 || timedTotalMs(state) <= 0;
}

export function reduceTimed(state: TimedState, event: TimedEvent): TimedState {
  switch (event.type) {
    case 'START': {
      if (state.status !== 'idle') return ignored(state, event.type);
      const started = { ...state, status: 'running' as const, clock: startClock(event.atMs) };
      if (isEmpty(state)) {
        return withLog({ ...started, status: 'done', clock: freezeClock(started.clock, 0, event.atMs) }, 'empty block → done');
      }
      return withLog(started, `START ${state.spec.format}`);
    }
    case 'PAUSE': {
      const s = syncTimed(state, event.atMs);
      if (s.status !== 'running') return ignored(s, event.type);
      return withLog({ ...s, status: 'paused', clock: pauseClock(s.clock, event.atMs) }, `PAUSE at ${Math.round(activeMsAt(s.clock, event.atMs) / 1000)}s`);
    }
    case 'RESUME': {
      if (state.status !== 'paused') return ignored(state, event.type);
      return withLog({ ...state, status: 'running', clock: resumeClock(state.clock, event.atMs) }, 'RESUME');
    }
    case 'TICK':
      return syncTimed(state, event.atMs);
    default: {
      const s = syncTimed(state, event.atMs);
      switch (s.spec.format) {
        case 'tabata':
          return reduceTabata(s as Extract<TimedState, { spec: { format: 'tabata' } }>, event);
        case 'emom':
          return reduceEmom(s as Extract<TimedState, { spec: { format: 'emom' } }>, event, s.options.emomGraceMs);
        case 'amrap':
          return reduceAmrap(s as Extract<TimedState, { spec: { format: 'amrap' } }>, event);
      }
    }
  }
}

/** Fold a list of events (tests / replay after a reload). */
export function reduceTimedAll(state: TimedState, events: readonly TimedEvent[]): TimedState {
  return events.reduce(reduceTimed, state);
}
