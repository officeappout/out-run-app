/**
 * timed-results — the finished blocks of the CURRENT session, in memory only
 * (enable_home_v2). The live summary that follows the player reads them for
 * the format cards (AMRAP score + round times, EMOM minute by minute). Not
 * persisted: no new document fields; a summary opened later from history
 * simply has no format card (its sets table still comes from the log).
 */
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';

export interface RecordedTimedResult {
  segmentId: string;
  result: TimedBlockResult;
}

let sessionKey: string | null = null;
let results: RecordedTimedResult[] = [];

/** A new player session starts (a different workout id clears the previous one). */
export function beginTimedSession(key: string): void {
  if (key === sessionKey) return;
  sessionKey = key;
  results = [];
}

export function recordTimedResult(segmentId: string, result: TimedBlockResult): void {
  results = [...results.filter((r) => r.segmentId !== segmentId), { segmentId, result }];
}

/** Results for the given segment ids, in plan order. */
export function timedResultsFor(segmentIds: readonly string[]): RecordedTimedResult[] {
  return segmentIds.flatMap((id) => results.filter((r) => r.segmentId === id));
}

/** Tests only. */
export function resetTimedResults(): void {
  sessionKey = null;
  results = [];
}
