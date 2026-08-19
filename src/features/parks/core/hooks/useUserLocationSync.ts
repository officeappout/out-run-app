'use client';

/**
 * useUserLocationSync — opportunistic geohash index writer (Phase 3,
 * social-activities build plan). Feeds `userLocations/{uid}`, the one
 * genuinely net-new backend dependency for onPlannedActivityCreated's
 * radius-based push targeting (geohashQueryBounds over this collection —
 * NOT users/ or presence/, both deliberately left untouched per the plan).
 *
 * Deliberately NOT a heartbeat — no interval timer, no unmount cleanup, no
 * presence semantics. Just: whenever the map or home screen has a GPS fix
 * available and hasn't written recently, opportunistically refresh the
 * index. Mount with `useUserLocationSync()` in any screen where the user is
 * expected to have location permission active (DiscoverLayer, home/page.tsx).
 */

import { useEffect, useRef } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { db, auth } from '@/lib/firebase';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

/** Opportunistic, not a heartbeat — a coarse index refresh is plenty for a
 *  3km radius push query; no need to write on every GPS tick. */
const MIN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function useUserLocationSync(): void {
  const coords = useGPSStore((s) => s.coords);
  const lastWriteAtRef = useRef(0);

  useEffect(() => {
    if (!coords || !auth.currentUser) return;
    const now = Date.now();
    if (now - lastWriteAtRef.current < MIN_WRITE_INTERVAL_MS) return;
    lastWriteAtRef.current = now;

    const geohash = geohashForLocation([coords.lat, coords.lng], 9);
    setDoc(
      doc(db, 'userLocations', auth.currentUser.uid),
      { geohash, lat: coords.lat, lng: coords.lng, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((err) => {
      console.warn('[useUserLocationSync] write failed:', err);
    });
  }, [coords]);
}
