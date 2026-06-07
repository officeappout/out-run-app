'use client';

import { useEffect } from 'react';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';

export interface UserCoords {
  lat: number;
  lng: number;
}

/**
 * Reads the shared GPS fix from `useGPSStore` (populated by the single GPS
 * driver, `useGPS.ts`). On mount it issues a courtesy permission request via
 * `requestPermissionIfAllowed` — prompting only when we have no fix and the
 * user hasn't explicitly denied us. Returns null coords while no fix is
 * available (no fix yet, denied, or unsupported).
 */
export function useUserLocation(): { userCoords: UserCoords | null; loading: boolean } {
  const userCoords = useGPSStore((s) => s.coords);
  const permissionState = useGPSStore((s) => s.permissionState);

  useEffect(() => {
    useGPSStore.getState().requestPermissionIfAllowed();
  }, []);

  // "Loading" only while we have neither a fix nor a definitive permission
  // answer yet. Once denied/granted is known, we stop reporting loading.
  const loading = userCoords === null && permissionState === 'unknown';

  return { userCoords, loading };
}
