'use client';

import { useState, useEffect } from 'react';

export interface UserCoords {
  lat: number;
  lng: number;
}

/**
 * Requests the browser's one-shot geolocation.
 * Returns null while loading or if the user denies / browser is unsupported.
 */
export function useUserLocation(): { userCoords: UserCoords | null; loading: boolean } {
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 6000, maximumAge: 60_000 },
    );
  }, []);

  return { userCoords, loading };
}
