'use client';

import { useMemo } from 'react';
import { useNearbyParks } from '@/features/parks/core/hooks/useNearbyParks';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

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
 *   1. Reads the user's location straight from the shared GPS store
 *      (`useGPSStore`, driven by useGPS). This hook NEVER opens its own
 *      watcher or triggers a permission prompt — when no fix is available
 *      the partner hint just stays hidden.
 *   2. Pipes the location into `usePartnerData` (single Firestore listener)
 *      and counts partners whose `activityStatus` matches `strength` or
 *      `workout`.
 *   3. Surfaces the `useNearbyParks(isOpen)` result so the orchestrator
 *      can render the "Where to Train" carousel without taking a direct
 *      dependency on the parks hook.
 */
export function usePartnerPresence(isOpen: boolean): UsePartnerPresenceReturn {
  const userLocation = useGPSStore((s) => s.coords) as UserLocation | null;

  const { live: livePartners } = usePartnerData(userLocation, 5);
  const similarCount = useMemo(
    () => livePartners.filter((p) => ['strength', 'workout'].includes(p.activityStatus ?? '')).length,
    [livePartners],
  );

  const nearbyParks = useNearbyParks(isOpen);

  return { userLocation, similarCount, nearbyParks };
}
