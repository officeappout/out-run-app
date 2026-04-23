'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FALLBACK_SDEROT = { lat: 31.525, lng: 34.5955 };

export interface GPSState {
  currentUserPos: { lat: number; lng: number } | null;
  setCurrentUserPos: (pos: { lat: number; lng: number } | null) => void;
  locationError: string | null;
  userBearing: number;
  isFollowing: boolean;
  handleLocationClick: () => void;
  setSimulationActive: (active: boolean) => void;
}

export function useGPS(): GPSState {
  const [currentUserPos, setCurrentUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userBearing, setUserBearing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [simulationActive, setSimulationActive] = useState(false);
  const watchId = useRef<number | null>(null);
  const hasFallback = useRef(false);

  useEffect(() => {
    // When simulation is on: kill the watcher — mock position drives the UI instead
    if (simulationActive) {
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch { /* ignore */ }
        watchId.current = null;
      }
      setLocationError(null);
      return;
    }

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      if (!hasFallback.current) {
        hasFallback.current = true;
        setCurrentUserPos(FALLBACK_SDEROT);
      }
      return;
    }

    // Fix #3a: use watchPosition (not one-shot getCurrentPosition) so we receive
    // continuous position AND heading updates from the device compass.
    if (watchId.current != null) return; // already watching

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (simulationActive) return;
        setLocationError(null);
        setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        // heading is null when the device cannot determine direction (e.g. stationary)
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setUserBearing(pos.coords.heading);
        }
      },
      (error) => {
        if (simulationActive) return;
        // Fall back to Sderot only on permission-denied or after the first error
        if (!hasFallback.current) {
          hasFallback.current = true;
          setCurrentUserPos(FALLBACK_SDEROT);
        }
        setLocationError(error.message);
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    return () => {
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch { /* ignore */ }
        watchId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationActive]);

  const handleLocationClick = useCallback(() => {
    if (simulationActive) return;
    if (!('geolocation' in navigator)) return;
    setIsFollowing((prev) => !prev);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (simulationActive) return;
        setLocationError(null);
        setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setUserBearing(pos.coords.heading);
        }
      },
      () => { /* silent on manual retry */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [simulationActive]);

  return {
    currentUserPos,
    setCurrentUserPos,
    locationError,
    userBearing,
    isFollowing,
    handleLocationClick,
    setSimulationActive,
  };
}
