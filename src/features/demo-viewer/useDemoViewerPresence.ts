'use client';

/**
 * Demo users who are "out training" right now — for the demo viewer only (PR 5).
 * Polls /api/demo/viewer-presence every POLL_MS while the page is visible; everyone
 * else never calls it (returns a stable empty list). Shaped like the presence docs
 * the partner finder already consumes (RawPresenceDoc).
 */
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { RawPresenceDoc } from '@/lib/nearbyPresence.service';
import { useDemoViewerWorld } from './useDemoViewerWorld';
import { demoMarkersToPresenceDocs } from './viewer-presence';

const POLL_MS = 60_000;
const EMPTY: RawPresenceDoc[] = [];

export function useDemoViewerPresence(): RawPresenceDoc[] {
  const world = useDemoViewerWorld();
  const [docs, setDocs] = useState<RawPresenceDoc[]>(EMPTY);

  useEffect(() => {
    if (!world) {
      setDocs(EMPTY);
      return;
    }
    let alive = true;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/demo/viewer-presence', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = (await res.json()) as { markers?: unknown };
        if (alive) setDocs(demoMarkersToPresenceDocs(body.markers));
      } catch {
        /* keep the last list — the next poll retries */
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [world]);

  return docs;
}
