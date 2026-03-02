'use client';

/**
 * useKudosInbox — listens for incoming kudos during an active workout.
 *
 * When a new kudo arrives:
 *   1. Haptic pulse (triple vibration)
 *   2. Pushes kudo into `pendingKudos` queue
 *   3. Auto-marks as read after display
 *
 * The consumer renders a `KudoToast` for each pending kudo.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeToKudos,
  markKudoRead,
  type KudoDoc,
} from '../services/kudos.service';

export interface UseKudosInboxResult {
  currentKudo: KudoDoc | null;
  dismissKudo: () => void;
}

function triggerKudoHaptic(): void {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([20, 50, 20, 50, 30]);
  }
}

export function useKudosInbox(myUid: string | undefined): UseKudosInboxResult {
  const [queue, setQueue] = useState<KudoDoc[]>([]);
  const [currentKudo, setCurrentKudo] = useState<KudoDoc | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef(new Set<string>());

  // Subscribe to Firestore
  useEffect(() => {
    if (!myUid) return;

    const unsub = subscribeToKudos(myUid, (kudo) => {
      if (seenIdsRef.current.has(kudo.id)) return;
      seenIdsRef.current.add(kudo.id);

      triggerKudoHaptic();
      setQueue((prev) => [...prev, kudo]);
    });

    return () => unsub();
  }, [myUid]);

  // Process queue — show one kudo at a time
  useEffect(() => {
    if (currentKudo || queue.length === 0) return;

    const next = queue[0];
    setCurrentKudo(next);
    setQueue((prev) => prev.slice(1));

    // Auto-dismiss after 3 seconds
    timerRef.current = setTimeout(() => {
      setCurrentKudo(null);
      if (myUid) markKudoRead(myUid, next.id).catch(() => {});
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queue, currentKudo, myUid]);

  const dismissKudo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentKudo && myUid) {
      markKudoRead(myUid, currentKudo.id).catch(() => {});
    }
    setCurrentKudo(null);
  }, [currentKudo, myUid]);

  return { currentKudo, dismissKudo };
}
