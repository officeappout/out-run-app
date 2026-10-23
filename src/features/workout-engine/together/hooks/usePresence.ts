'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { orderParticipants, type OrderedParticipant } from '../core/presence-order';
import { sampleOffset, type OffsetSample } from '../core/clock-offset';
import { diffTogetherEvents, cheersReceived, type TogetherEvent } from '../core/cheers';
import type { PresenceAdapter, PresenceEntry, SessionRef } from '../core/types';
import { firestorePresenceAdapter } from '../services/firestore-presence-adapter';

export interface UsePresenceResult {
  /** Ordered for the rail: me, live by progress, done, stale. */
  participants: OrderedParticipant[];
  /** Raw entries (summary / lobby maths). */
  entries: PresenceEntry[];
  /** serverClock − localClock in ms (0 until a sample lands). */
  clockOffsetMs: number;
  /** Cheers received per uid. */
  cheers: Record<string, number>;
  /** One-shot events since the last render batch (toasts); consume with `ackEvents`. */
  events: TogetherEvent[];
  ackEvents: (ids: string[]) => void;
}

/**
 * usePresence(sessionRef) — subscribes to the session's presence docs and
 * returns them ordered. `ref = null` (flag off / not a together session)
 * subscribes to nothing. Re-evaluates freshness every 5 s so a silent
 * participant slides to "stale" without a new snapshot.
 */
export function usePresence(
  ref: SessionRef | null,
  meUid: string | null | undefined,
  adapter: PresenceAdapter = firestorePresenceAdapter,
): UsePresenceResult {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [events, setEvents] = useState<TogetherEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const prevRef = useRef<PresenceEntry[] | null>(null);
  const bestRef = useRef<OffsetSample | null>(null);
  const groupId = ref?.groupId;
  const attendanceId = ref?.attendanceId;

  useEffect(() => {
    prevRef.current = null;
    bestRef.current = null;
    setEntries([]);
    setEvents([]);
    if (!groupId || !attendanceId) return;
    const unsub = adapter.subscribe(
      { groupId, attendanceId },
      (next) => {
        const found = diffTogetherEvents(prevRef.current, next, meUid);
        prevRef.current = next;
        if (found.length) setEvents((cur) => [...cur, ...found.filter((f) => !cur.some((c) => c.id === f.id))]);
        const best = sampleOffset(bestRef.current, next.find((e) => e.uid === meUid), Date.now());
        if (best !== bestRef.current) {
          bestRef.current = best;
          setOffset(Math.round(best?.offsetMs ?? 0));
        }
        setEntries(next);
      },
      (err) => console.warn('[together] presence subscribe failed:', err),
    );
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => { unsub(); clearInterval(timer); };
  }, [groupId, attendanceId, meUid, adapter]);

  const participants = useMemo(
    () => orderParticipants(entries, meUid, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, meUid, tick],
  );
  const cheers = useMemo(() => cheersReceived(entries), [entries]);
  const ackEvents = (ids: string[]) => setEvents((cur) => cur.filter((e) => !ids.includes(e.id)));

  return { participants, entries, clockOffsetMs: offset, cheers, events, ackEvents };
}
