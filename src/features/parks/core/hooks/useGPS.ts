'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FALLBACK_SDEROT = { lat: 31.525, lng: 34.5955 };

/**
 * Validates a raw browser `GeolocationPosition.coords` payload before it
 * enters React state. Browsers (and especially mobile WebViews) occasionally
 * deliver coords that pass the type check but are NaN or Infinity:
 *   • Android Chrome under low-power mode after a wake.
 *   • iOS Safari simulator under "no location" + manual feed.
 *   • Custom Capacitor bridges that forward a failed position as zeros/NaN
 *     instead of triggering the error callback.
 * Any of these would propagate downstream into TurnCarousel → AppMap and
 * crash Mapbox with `LngLat invalid: NaN, NaN`. This guard is the gateway
 * that prevents the bad sample from ever leaving the GPS layer.
 */
function isValidGeoSample(coords: GeolocationCoordinates | null | undefined): coords is GeolocationCoordinates {
  if (!coords) return false;
  const { latitude, longitude } = coords;
  return typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    // Reject the suspicious "ocean nullsville" 0,0 fix that some buggy
    // chipsets emit on cold-start instead of the proper error callback.
    && !(latitude === 0 && longitude === 0);
}

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
        // Drop NaN / 0,0 / undefined-coords samples ENTIRELY rather than
        // letting them poison currentUserPos (which feeds TurnCarousel,
        // route generation, deviation detection, etc.). The previous fix
        // is preserved, so the next valid sample will overwrite cleanly.
        if (!isValidGeoSample(pos.coords)) {
          console.warn('[useGPS] Dropping invalid GPS sample:', pos.coords);
          return;
        }
        setLocationError(null);
        setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        // heading is null when the device cannot determine direction (e.g. stationary)
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setUserBearing(pos.coords.heading);
        }
      },
      (error) => {
        if (simulationActive) return;
        // Error codes per GeolocationPositionError:
        //   1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        // Code 3 (TIMEOUT) fires every ~10s while the chip is still locking
        // on — it is NOT a fatal error and we deliberately avoid wiping
        // currentUserPos here (the last good fix is still our best estimate
        // until a fresher one arrives). Fallback to Sderot fires once on
        // the first error so the map has SOMETHING to render at startup.
        if (!hasFallback.current) {
          hasFallback.current = true;
          setCurrentUserPos(FALLBACK_SDEROT);
        }
        setLocationError(error.message);
        // Quiet the console for benign timeouts; surface the others.
        if (error.code !== 3) {
          console.warn('[useGPS] Geolocation error', error.code, error.message);
        }
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
        if (!isValidGeoSample(pos.coords)) {
          console.warn('[useGPS] Dropping invalid one-shot GPS sample:', pos.coords);
          return;
        }
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
