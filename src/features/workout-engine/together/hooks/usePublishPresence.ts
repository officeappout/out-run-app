'use client';

import { useEffect, useRef } from 'react';
import { createPresencePublisher, type PresencePublisher, type StatusInput } from '../services/presence-publisher';
import { TOGETHER_CONFIG } from '../core/config';
import { firestorePresenceAdapter } from '../services/firestore-presence-adapter';
import type { PresenceAdapter, SessionRef } from '../core/types';

/**
 * usePublishPresence — publishes MY tiny live status to the session doc,
 * throttled to ≤ 1 write / 4 s, only while `ref` is set (a together session is
 * active). On unmount / session end it sends one final `done` status and stops.
 * Pass the latest status on every render; the publisher keeps just the newest.
 */
export function usePublishPresence(
  ref: SessionRef | null,
  status: StatusInput | null,
  adapter: PresenceAdapter = firestorePresenceAdapter,
): void {
  const pubRef = useRef<PresencePublisher | null>(null);
  const statusRef = useRef<StatusInput | null>(status);
  statusRef.current = status;
  const groupId = ref?.groupId;
  const attendanceId = ref?.attendanceId;

  useEffect(() => {
    if (!groupId || !attendanceId) return;
    const pub = createPresencePublisher({
      adapter,
      ref: { groupId, attendanceId },
      onError: (err) => console.warn('[together] presence write failed:', err),
    });
    pubRef.current = pub;
    const heartbeat = setInterval(() => pub.tick(), TOGETHER_CONFIG.heartbeatMs);
    return () => {
      clearInterval(heartbeat);
      pub.finish();
      pubRef.current = null;
    };
  }, [groupId, attendanceId, adapter]);

  // Offer every new status; the publisher decides whether it is time to write.
  const key = status
    ? [status.uid, status.state, status.distanceKm?.toFixed(2), Math.round(status.paceSecPerKm ?? 0), status.set, status.round, status.minute, status.roundsDone, JSON.stringify(status.cheersSent ?? {})].join('|')
    : '';
  useEffect(() => {
    if (statusRef.current) pubRef.current?.update(statusRef.current);
  }, [key, groupId, attendanceId]);
}
