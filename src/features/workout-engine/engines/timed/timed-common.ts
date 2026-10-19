/** Small shared helpers of the timed machines (pure). */
import type { TimedItem, TimedState } from './timed.types';

export function withLog<S extends TimedState>(state: S, line: string): S {
  return { ...state, log: [...state.log, line] };
}

export function ignored<S extends TimedState>(state: S, type: string): S {
  return withLog(state, `ignored ${type} in ${state.status}`);
}

/** Non-negative integer reps, or null. */
export function cleanReps(reps: number | undefined | null): number | null {
  if (reps == null || !Number.isFinite(reps)) return null;
  return Math.max(0, Math.round(reps));
}

/** The prefilled value for a "done" tap: the item's target (reps or hold seconds). */
export function defaultReps(item: TimedItem | undefined): number | null {
  if (!item || item.kind !== 'exercise') return null;
  if (item.targetReps != null && item.targetReps > 0) return item.targetReps;
  if (item.targetHoldSec != null && item.targetHoldSec > 0) return item.targetHoldSec;
  return null;
}

/** True when an aerobic item's target is met by distance or by time. */
export function aerobicTargetReached(item: TimedItem | undefined, distanceM: number, elapsedMs: number): boolean {
  if (!item || item.kind !== 'aerobic_leg') return false;
  if (item.distanceM != null && item.distanceM > 0) return distanceM >= item.distanceM;
  if (item.durationSec != null && item.durationSec > 0) return elapsedMs >= item.durationSec * 1000;
  return false;
}

/** Active ms at which a TIME-based aerobic item ends (null for distance legs). */
export function aerobicTimeTargetEndMs(item: TimedItem | undefined, startedActiveMs: number): number | null {
  if (!item || item.kind !== 'aerobic_leg') return null;
  if (item.distanceM != null && item.distanceM > 0) return null;
  if (item.durationSec != null && item.durationSec > 0) return startedActiveMs + item.durationSec * 1000;
  return null;
}
