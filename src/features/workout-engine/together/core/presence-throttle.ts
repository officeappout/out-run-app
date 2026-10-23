import { TOGETHER_CONFIG } from './config';
import type { PresenceStatus } from './types';

export type ThrottleDecision =
  | { action: 'write' }
  /** Hold the candidate and try again after `waitMs`. */
  | { action: 'wait'; waitMs: number }
  /** Nothing new and the heartbeat is not due. */
  | { action: 'skip' };

/** Fields whose change means the others see something different. */
const VISIBLE_KEYS: (keyof PresenceStatus)[] = [
  'state', 'distanceKm', 'paceSecPerKm', 'set', 'totalSets', 'round', 'minute', 'roundsDone',
];

function numStr(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** Did anything the rail shows change? Distance counts per 10 m, pace per second. */
export function statusChanged(prev: PresenceStatus | null, next: PresenceStatus): boolean {
  if (!prev) return true;
  if (JSON.stringify(prev.cheersSent ?? {}) !== JSON.stringify(next.cheersSent ?? {})) return true;
  for (const k of VISIBLE_KEYS) {
    if (k === 'state') {
      if (prev.state !== next.state) return true;
    } else if (k === 'distanceKm') {
      if (Math.round((prev.distanceKm ?? 0) * 100) !== Math.round((next.distanceKm ?? 0) * 100)) return true;
    } else if (k === 'paceSecPerKm') {
      if (Math.round(prev.paceSecPerKm ?? 0) !== Math.round(next.paceSecPerKm ?? 0)) return true;
    } else if (numStr(prev[k]) !== numStr(next[k])) {
      return true;
    }
  }
  return false;
}

/**
 * Pure write scheduler: ≤ 1 write per `minWriteGapMs`; a state change
 * (paused / done) or a cheer is "urgent" only in that it waits the remaining
 * gap, never more; an unchanged status is re-written every `heartbeatMs`.
 */
export function decidePublish(input: {
  lastWritten: PresenceStatus | null;
  lastWriteMs: number | null;
  candidate: PresenceStatus;
  nowMs: number;
  minGapMs?: number;
  heartbeatMs?: number;
}): ThrottleDecision {
  const minGap = input.minGapMs ?? TOGETHER_CONFIG.minWriteGapMs;
  const heartbeat = input.heartbeatMs ?? TOGETHER_CONFIG.heartbeatMs;
  const sinceLast = input.lastWriteMs == null ? Infinity : input.nowMs - input.lastWriteMs;
  const changed = statusChanged(input.lastWritten, input.candidate);
  if (!changed) return sinceLast >= heartbeat ? { action: 'write' } : { action: 'skip' };
  if (sinceLast >= minGap) return { action: 'write' };
  return { action: 'wait', waitMs: minGap - sinceLast };
}
