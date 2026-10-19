/**
 * amrap.machine — as many rounds as possible inside the cap. Every
 * "סיימתי" logs the current item and moves on; a finished round starts the
 * next one at once (no rest). At the cap the clock freezes and the engine
 * asks for the reps of the CURRENT item only (board A-2d) — everything
 * before it was already logged. A run item inside the round (U-E3) hands
 * off by GPS when its distance (or time) is reached; one cut by the cap is
 * recorded with the distance covered, no question asked.
 */
import { activeMsAt, freezeClock } from './timed-clock';
import {
  aerobicTargetReached,
  aerobicTimeTargetEndMs,
  cleanReps,
  defaultReps,
  ignored,
  withLog,
} from './timed-common';
import type { AmrapData, AmrapItemRecord, AmrapState, TimedEvent } from './timed.types';

export function initAmrapData(): AmrapData {
  return {
    rounds: [{ index: 0, startedActiveMs: 0, endedActiveMs: null, items: [] }],
    itemIndex: 0,
    itemStartedActiveMs: 0,
    aerobic: { distanceM: 0, ownerIndex: 0 },
  };
}

export function amrapCapMs(state: AmrapState): number {
  return Math.max(0, state.spec.config.capSec) * 1000;
}

/** Running count of item visits — identifies the aerobic progress owner. */
function visitNumber(d: AmrapData, itemsPerRound: number): number {
  return (d.rounds.length - 1) * itemsPerRound + d.itemIndex;
}

function aerobicDistance(state: AmrapState): number {
  const v = visitNumber(state.data, state.spec.items.length);
  return state.data.aerobic.ownerIndex === v ? state.data.aerobic.distanceM : 0;
}

/** Log the current item at `atActiveMs` and advance (opens the next round when needed). */
function completeItem(state: AmrapState, atActiveMs: number, rec: Omit<AmrapItemRecord, 'itemIndex' | 'durationMs'>): AmrapState {
  const d = state.data;
  const n = state.spec.items.length;
  const rounds = d.rounds.slice();
  const cur = rounds[rounds.length - 1];
  const item: AmrapItemRecord = {
    ...rec,
    itemIndex: d.itemIndex,
    durationMs: Math.max(0, atActiveMs - d.itemStartedActiveMs),
  };
  const items = [...cur.items, item];
  const roundDone = !rec.partial && d.itemIndex + 1 >= n;
  rounds[rounds.length - 1] = { ...cur, items, endedActiveMs: roundDone || rec.partial ? atActiveMs : null };
  if (roundDone) rounds.push({ index: rounds.length, startedActiveMs: atActiveMs, endedActiveMs: null, items: [] });
  return withLog(
    {
      ...state,
      data: { ...d, rounds, itemIndex: roundDone ? 0 : d.itemIndex + 1, itemStartedActiveMs: atActiveMs },
    },
    roundDone ? `amrap: round ${cur.index + 1} done` : `amrap: item ${d.itemIndex + 1} done`,
  );
}

/** Freeze at the cap (or early finish): a run is closed as-is, an exercise asks for reps. */
function reachCap(state: AmrapState, capActiveMs: number, atMs: number, reason: string): AmrapState {
  const clock = freezeClock(state.clock, capActiveMs, atMs);
  const frozen = clock.frozenActiveMs ?? capActiveMs;
  const item = state.spec.items[state.data.itemIndex];
  const s: AmrapState = { ...state, clock };
  if (item?.kind === 'aerobic_leg') {
    const closed = completeItem(s, frozen, { reps: null, repsEdited: false, distanceM: aerobicDistance(s), partial: true });
    return withLog({ ...closed, status: 'done' }, `amrap: ${reason} during run`);
  }
  return withLog({ ...s, status: 'awaiting_partial' }, `amrap: ${reason} → awaiting partial reps`);
}

/** Apply time-driven transitions up to `atMs`: timed runs that ended, then the cap. */
export function syncAmrap(state: AmrapState, atMs: number): AmrapState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  const cap = amrapCapMs(state);
  const active = activeMsAt(state.clock, atMs);
  let s = state;
  // Time-based runs complete on their own (bounded: one per round item).
  for (let guard = 0; guard < Math.max(1, s.spec.items.length); guard++) {
    const item = s.spec.items[s.data.itemIndex];
    const end = aerobicTimeTargetEndMs(item, s.data.itemStartedActiveMs);
    if (end == null || end > Math.min(active, cap)) break;
    s = completeItem(s, end, { reps: null, repsEdited: false, distanceM: aerobicDistance(s), partial: false });
  }
  if (active >= cap) return reachCap(s, cap, atMs, 'cap reached');
  return s;
}

export function reduceAmrap(state: AmrapState, event: TimedEvent): AmrapState {
  const live = state.status === 'running' || state.status === 'paused';
  switch (event.type) {
    case 'ITEM_DONE': {
      if (!live) return ignored(state, event.type);
      const item = state.spec.items[state.data.itemIndex];
      const active = activeMsAt(state.clock, event.atMs);
      if (item?.kind === 'aerobic_leg') {
        return completeItem(state, active, { reps: null, repsEdited: false, distanceM: aerobicDistance(state), partial: false });
      }
      const reps = cleanReps(event.reps) ?? defaultReps(item);
      return completeItem(state, active, { reps, repsEdited: event.reps != null, distanceM: null, partial: false });
    }
    case 'AEROBIC_PROGRESS': {
      if (!live) return ignored(state, event.type);
      const item = state.spec.items[state.data.itemIndex];
      if (item?.kind !== 'aerobic_leg') return ignored(state, event.type);
      const distanceM = Math.max(0, event.distanceM);
      const owner = visitNumber(state.data, state.spec.items.length);
      const s: AmrapState = { ...state, data: { ...state.data, aerobic: { distanceM, ownerIndex: owner } } };
      const active = activeMsAt(s.clock, event.atMs);
      if (!aerobicTargetReached(item, distanceM, active - s.data.itemStartedActiveMs)) return s;
      return completeItem(s, active, { reps: null, repsEdited: false, distanceM, partial: false });
    }
    case 'LOG_REPS': {
      if (state.status !== 'awaiting_partial') return ignored(state, event.type);
      const reps = cleanReps(event.reps) ?? 0;
      const at = state.clock.frozenActiveMs ?? amrapCapMs(state);
      const closed = completeItem(state, at, { reps, repsEdited: true, distanceM: null, partial: true });
      return withLog({ ...closed, status: 'done' }, `amrap: partial ${reps} reps logged`);
    }
    case 'FINISH': {
      if (state.status === 'awaiting_partial') {
        // Skip the partial entry: the open round keeps what was logged.
        const rounds = state.data.rounds.slice();
        const last = rounds[rounds.length - 1];
        rounds[rounds.length - 1] = { ...last, endedActiveMs: last.items.length > 0 ? state.clock.frozenActiveMs : null };
        return withLog({ ...state, status: 'done', data: { ...state.data, rounds } }, 'amrap: partial entry skipped');
      }
      if (!live) return ignored(state, event.type);
      return reachCap(state, activeMsAt(state.clock, event.atMs), event.atMs, 'finished early');
    }
    default:
      return state;
  }
}
