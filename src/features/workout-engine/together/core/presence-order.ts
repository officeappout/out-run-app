import { TOGETHER_CONFIG } from './config';
import type { PresenceEntry } from './types';

export type Freshness = 'live' | 'stale';

export interface OrderedParticipant extends PresenceEntry {
  isMe: boolean;
  freshness: Freshness;
  /** Seconds since the last write (rounded), null when unknown. */
  lastSeenSec: number | null;
  /** 1-based rank among the active ones, 0 for done / stale. */
  rank: number;
}

/** Comparable "how far along" number inside one kind. Higher = ahead. */
export function progressOf(e: PresenceEntry): number {
  switch (e.kind) {
    case 'run': return e.distanceKm ?? 0;
    case 'strength': return (e.set ?? 0);
    case 'amrap': return (e.roundsDone ?? e.round ?? 0);
    case 'emom': return (e.minute ?? 0);
  }
}

/**
 * Rail order: me first, then the live ones by progress (ties by name), then
 * the finished, then the stale. Pure and stable.
 */
export function orderParticipants(
  entries: PresenceEntry[],
  meUid: string | null | undefined,
  nowMs: number,
  staleAfterMs: number = TOGETHER_CONFIG.staleAfterMs,
): OrderedParticipant[] {
  const mapped = entries.map((e) => {
    const seenMs = e.serverMs ?? e.clientMs;
    const age = Number.isFinite(seenMs) ? Math.max(0, nowMs - seenMs) : null;
    const freshness: Freshness = e.state === 'done' || age == null || age <= staleAfterMs ? 'live' : 'stale';
    return { ...e, isMe: e.uid === meUid, freshness, lastSeenSec: age == null ? null : Math.round(age / 1000), rank: 0 };
  });
  const group = (p: OrderedParticipant) => (p.isMe ? 0 : p.state === 'done' ? 2 : p.freshness === 'stale' ? 3 : 1);
  mapped.sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    const pr = progressOf(b) - progressOf(a);
    if (pr !== 0) return pr;
    return a.name.localeCompare(b.name, 'he') || a.uid.localeCompare(b.uid);
  });
  let rank = 0;
  for (const p of [...mapped].sort((a, b) => progressOf(b) - progressOf(a) || a.uid.localeCompare(b.uid))) {
    if (p.state !== 'done' && p.freshness === 'live') p.rank = ++rank;
  }
  return mapped;
}
