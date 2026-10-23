'use client';

import { useEffect, useMemo, useState } from 'react';
import { firestorePresenceAdapter } from '../services/firestore-presence-adapter';
import { buildTogetherSummary, type TogetherSummary } from '../core/summary';
import type { PresenceAdapter, PresenceEntry } from '../core/types';

/** The session's final presence docs → the together summary (null while loading / not together). */
export function useTogetherSummary(
  groupId: string | null | undefined,
  attendanceId: string | null | undefined,
  meUid: string | null | undefined,
  enabled: boolean,
  adapter: PresenceAdapter = firestorePresenceAdapter,
): TogetherSummary | null {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  useEffect(() => {
    if (!enabled || !groupId || !attendanceId) { setEntries([]); return; }
    return adapter.subscribe({ groupId, attendanceId }, setEntries, (e) => console.warn('[together] summary subscribe failed:', e));
  }, [enabled, groupId, attendanceId, adapter]);
  return useMemo(() => buildTogetherSummary(entries, meUid), [entries, meUid]);
}
