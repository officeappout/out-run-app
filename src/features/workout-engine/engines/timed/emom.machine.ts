/**
 * emom.machine — every minute (intervalSec) the next item starts; the user
 * taps "סיימתי" (or the run hands off by GPS) and the rest of the minute is
 * rest. A minute that ends without "done" is MISSED; the user may still log
 * what they did (→ partial, or done when the target was reached). Board A-4.
 */
import { activeMsAt, freezeClock } from './timed-clock';
import { aerobicTargetReached, cleanReps, defaultReps, ignored, withLog } from './timed-common';
import type { EmomData, EmomMinute, EmomState, TimedBlockSpec, TimedEvent } from './timed.types';

export function initEmomData(spec: Extract<TimedBlockSpec, { format: 'emom' }>): EmomData {
  const n = Math.max(0, Math.floor(spec.config.totalIntervals));
  const count = Math.max(1, spec.items.length);
  const minutes: EmomMinute[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    itemIndex: i % count,
    status: 'pending',
    workMs: null,
    reps: null,
    repsEdited: false,
    distanceM: null,
  }));
  return { minutes, aerobic: { distanceM: 0, ownerIndex: 0 } };
}

export function emomIntervalMs(state: EmomState): number {
  return Math.max(1, state.spec.config.intervalSec) * 1000;
}

export function emomTotalMs(state: EmomState): number {
  return emomIntervalMs(state) * state.data.minutes.length;
}

/** Minute index at an active time (clamped to the last minute). */
export function emomMinuteAt(state: EmomState, activeMs: number): number {
  const n = state.data.minutes.length;
  if (n === 0) return 0;
  return Math.min(n - 1, Math.floor(activeMs / emomIntervalMs(state)));
}

function setMinute(state: EmomState, index: number, patch: Partial<EmomMinute>): EmomState {
  const minutes = state.data.minutes.slice();
  minutes[index] = { ...minutes[index], ...patch };
  return { ...state, data: { ...state.data, minutes } };
}

function targetOf(state: EmomState, m: EmomMinute): number | null {
  return defaultReps(state.spec.items[m.itemIndex]);
}

/** Close every pending minute before `upTo` (exclusive) as missed. */
function missBefore(state: EmomState, upTo: number): EmomState {
  let s = state;
  for (let i = 0; i < Math.min(upTo, s.data.minutes.length); i++) {
    const m = s.data.minutes[i];
    if (m.status !== 'pending') continue;
    const item = s.spec.items[m.itemIndex];
    const dist = item?.kind === 'aerobic_leg' && s.data.aerobic.ownerIndex === i ? s.data.aerobic.distanceM : null;
    s = withLog(setMinute(s, i, { status: 'missed', distanceM: dist }), `emom: minute ${i + 1} missed`);
  }
  return s;
}

/** Apply time-driven transitions up to `atMs`. */
export function syncEmom(state: EmomState, atMs: number): EmomState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  const active = activeMsAt(state.clock, atMs);
  const total = emomTotalMs(state);
  if (active >= total) {
    const s = missBefore(state, state.data.minutes.length);
    return withLog({ ...s, status: 'done', clock: freezeClock(s.clock, total, atMs) }, 'emom: all minutes done');
  }
  const cur = emomMinuteAt(state, active);
  let s = missBefore(state, cur);
  // A time-based run inside the minute completes on its own.
  const m = s.data.minutes[cur];
  const item = m ? s.spec.items[m.itemIndex] : undefined;
  if (m && m.status === 'pending' && item?.kind === 'aerobic_leg') {
    const inMinute = active - cur * emomIntervalMs(s);
    const dist = s.data.aerobic.ownerIndex === cur ? s.data.aerobic.distanceM : 0;
    if (aerobicTargetReached(item, dist, inMinute)) {
      const workMs = item.durationSec ? Math.min(inMinute, item.durationSec * 1000) : inMinute;
      s = withLog(setMinute(s, cur, { status: 'done', workMs, distanceM: dist }), `emom: minute ${cur + 1} run done`);
    }
  }
  return s;
}

export function reduceEmom(state: EmomState, event: TimedEvent, graceMs: number): EmomState {
  const live = state.status === 'running' || state.status === 'paused';
  switch (event.type) {
    case 'ITEM_DONE': {
      if (!live) return ignored(state, event.type);
      const active = activeMsAt(state.clock, event.atMs);
      const intervalMs = emomIntervalMs(state);
      const cur = emomMinuteAt(state, active);
      const inMinute = active - cur * intervalMs;
      const prev = cur > 0 ? state.data.minutes[cur - 1] : undefined;
      // Tap landed just after the minute rolled over → it was meant for the minute that ended.
      if (prev && prev.status === 'missed' && inMinute <= graceMs && !prev.repsEdited) {
        const reps = cleanReps(event.reps) ?? targetOf(state, prev);
        return withLog(
          setMinute(state, cur - 1, { status: 'done', workMs: intervalMs, reps, repsEdited: event.reps != null }),
          `emom: late tap credited to minute ${cur}`,
        );
      }
      const m = state.data.minutes[cur];
      if (!m || m.status !== 'pending') return ignored(state, event.type);
      const item = state.spec.items[m.itemIndex];
      const isRun = item?.kind === 'aerobic_leg';
      const reps = isRun ? null : cleanReps(event.reps) ?? targetOf(state, m);
      const dist = isRun && state.data.aerobic.ownerIndex === cur ? state.data.aerobic.distanceM : null;
      return withLog(
        setMinute(state, cur, { status: 'done', workMs: inMinute, reps, repsEdited: event.reps != null, distanceM: dist }),
        `emom: minute ${cur + 1} done at ${Math.round(inMinute / 1000)}s`,
      );
    }
    case 'AEROBIC_PROGRESS': {
      if (!live) return ignored(state, event.type);
      const active = activeMsAt(state.clock, event.atMs);
      const cur = emomMinuteAt(state, active);
      const m = state.data.minutes[cur];
      const item = m ? state.spec.items[m.itemIndex] : undefined;
      if (!m || m.status !== 'pending' || item?.kind !== 'aerobic_leg') return ignored(state, event.type);
      const distanceM = Math.max(0, event.distanceM);
      let s: EmomState = { ...state, data: { ...state.data, aerobic: { distanceM, ownerIndex: cur } } };
      const inMinute = active - cur * emomIntervalMs(s);
      if (aerobicTargetReached(item, distanceM, inMinute)) {
        s = withLog(setMinute(s, cur, { status: 'done', workMs: inMinute, distanceM }), `emom: minute ${cur + 1} run reached`);
      }
      return s;
    }
    case 'LOG_REPS': {
      if (state.status === 'idle') return ignored(state, event.type);
      const reps = cleanReps(event.reps);
      if (reps == null) return ignored(state, event.type);
      const active = activeMsAt(state.clock, event.atMs);
      const cur = state.status === 'done' ? state.data.minutes.length - 1 : emomMinuteAt(state, active);
      let index = event.index;
      if (index == null) {
        index = -1;
        for (let i = cur; i >= 0; i--) {
          if (state.data.minutes[i]?.status !== 'done') {
            index = i;
            break;
          }
        }
      }
      if (index < 0 || index > cur || index >= state.data.minutes.length) return ignored(state, event.type);
      const m = state.data.minutes[index];
      const target = targetOf(state, m);
      const status = target != null && reps >= target ? 'done' : 'partial';
      const intervalMs = emomIntervalMs(state);
      const workMs =
        m.workMs ?? (index === cur && state.status !== 'done' ? active - cur * intervalMs : intervalMs);
      return withLog(
        setMinute(state, index, { status, reps, repsEdited: true, workMs }),
        `emom: minute ${index + 1} logged ${reps} (${status})`,
      );
    }
    case 'FINISH': {
      if (!live) return ignored(state, event.type);
      const active = activeMsAt(state.clock, event.atMs);
      const cur = emomMinuteAt(state, active);
      const s = missBefore(state, cur + 1);
      return withLog({ ...s, status: 'done', clock: freezeClock(s.clock, active, event.atMs) }, 'emom: finished early');
    }
    default:
      return state;
  }
}
