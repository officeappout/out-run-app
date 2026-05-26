'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNearbyParks } from '@/features/parks/core/hooks/useNearbyParks';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';

interface UserLocation {
  lat: number;
  lng: number;
}

interface UsePartnerPresenceReturn {
  /** User's current GPS coordinates, or `null` until permission is granted. */
  userLocation: UserLocation | null;
  /** Number of nearby partners currently in a strength/workout session. */
  similarCount: number;
  /** Nearest parks for the "Where to Train" carousel. */
  nearbyParks: ReturnType<typeof useNearbyParks>;
}

/**
 * Consolidated "who/where is nearby" hook.
 *
 * On drawer open:
 *   1. Issues a one-shot GPS request (silently no-ops when permission is
 *      denied — mirrors the permission-aware pattern from `useNearbyParks`).
 *   2. Pipes the resulting location into `usePartnerData` (single Firestore
 *      listener) and counts partners whose `activityStatus` matches
 *      `strength` or `workout`.
 *   3. Surfaces the `useNearbyParks(isOpen)` result so the orchestrator
 *      can render the "Where to Train" carousel without taking a direct
 *      dependency on the parks hook.
 */
export function usePartnerPresence(isOpen: boolean): UsePartnerPresenceReturn {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state !== 'granted') return;
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60_000,
          }),
        );
        if (cancelled) return;
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        /* permission denied / API unsupported — silently hide partner hint */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const { live: livePartners } = usePartnerData(userLocation, 5);
  const similarCount = useMemo(
    () => livePartners.filter((p) => ['strength', 'workout'].includes(p.activityStatus ?? '')).length,
    [livePartners],
  );

  const nearbyParks = useNearbyParks(isOpen);

  return { userLocation, similarCount, nearbyParks };
}
