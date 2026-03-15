'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FALLBACK_LOCATION = { lat: 32.0853, lng: 34.7818 };

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GPSState {
  currentUserPos: { lat: number; lng: number } | null;
  setCurrentUserPos: (pos: { lat: number; lng: number } | null) => void;
  locationError: string | null;
  userBearing: number;
  isFollowing: boolean;
  handleLocationClick: () => void;
}

export function useGPS(): GPSState {
  const [currentUserPos, setCurrentUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userBearing, setUserBearing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const hasRequestedLocation = useRef(false);

  useEffect(() => {
    if (hasRequestedLocation.current || typeof window === 'undefined' || !('geolocation' in navigator)) {
      if (!currentUserPos) setCurrentUserPos(FALLBACK_LOCATION);
      return;
    }

    hasRequestedLocation.current = true;

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (error) => {
          console.warn('[useGPS] Geolocation unavailable (code:', error.code, ')');
          setCurrentUserPos(FALLBACK_LOCATION);
          setLocationError(error.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
      );
    } catch {
      if (!currentUserPos) setCurrentUserPos(FALLBACK_LOCATION);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocationClick = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setIsFollowing((prev) => !prev);
    navigator.geolocation.getCurrentPosition((pos) => {
      setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }, []);

  return {
    currentUserPos,
    setCurrentUserPos,
    locationError,
    userBearing,
    isFollowing,
    handleLocationClick,
  };
}
