import { betterOffset } from './countdown';
import type { PresenceEntry } from './types';

export interface OffsetSample { offsetMs: number; rttMs: number }

/**
 * Learn serverClock − localClock from my own server-stamped presence write:
 * the doc carries when I sent it (`clientMs`) and what the server stamped; the
 * snapshot that confirms it arrives at `recvLocalMs`. Keeps the lowest-RTT sample.
 */
export function sampleOffset(best: OffsetSample | null, me: PresenceEntry | undefined, recvLocalMs: number): OffsetSample | null {
  if (!me || me.serverMs == null || !me.clientMs) return best;
  return betterOffset(best, me.serverMs, me.clientMs, recvLocalMs);
}
