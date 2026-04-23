'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

/**
 * Real-time hook that tracks which community_events the current user
 * is registered for. Listens to `community_events/{eventId}/registrations/{uid}`
 * for each provided eventId.
 *
 * Returns a Set<string> of eventIds where the user has a registration doc.
 * This survives drawer close/reopen since it reads from Firestore on mount.
 */
export function useMyRegistrations(eventIds: string[]): Set<string> {
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const unsubsRef = useRef<Unsubscribe[]>([]);

  useEffect(() => {
    // Cleanup previous listeners
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    const uid = auth.currentUser?.uid;
    if (!uid || eventIds.length === 0) {
      setRegistered(new Set());
      return;
    }

    const stableIds = eventIds.filter(Boolean);
    const current = new Set<string>();

    for (const eventId of stableIds) {
      const regRef = doc(db, 'community_events', eventId, 'registrations', uid);
      const unsub = onSnapshot(
        regRef,
        (snap) => {
          if (snap.exists()) {
            current.add(eventId);
          } else {
            current.delete(eventId);
          }
          setRegistered(new Set(current));
        },
        () => {
          // Permission error or doc doesn't exist — treat as not registered
        },
      );
      unsubsRef.current.push(unsub);
    }

    return () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    };
  }, [eventIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return registered;
}
