'use client';

/**
 * useFlyoverEntrance — Cinematic 3-step camera animation on first map visit.
 *
 * Sequence:
 *   Step 1: Country View  — zoom 6.5, pitch 0   (1.8s)
 *   Step 2: City View     — zoom 10,  pitch 20  (1.6s)
 *   Step 3: Street Level  — zoom 15,  pitch 45  (2.0s)
 *
 * Session persistence: runs once per browser session via sessionStorage.
 * After completion, sets `flyoverComplete = true` so the social layer can start.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MapRef } from 'react-map-gl';

const SESSION_KEY = 'flyover_played';

// Israel center point for the country overview
const COUNTRY_CENTER: [number, number] = [34.85, 31.5];

export interface UseFlyoverEntranceResult {
  flyoverComplete: boolean;
  /** Whether we're currently running the flyover (controls skipInitialZoom) */
  flyoverActive: boolean;
  /** Call once when AppMap fires onMapRef */
  handleMapRef: (ref: MapRef) => void;
}

export function useFlyoverEntrance(
  userLocation: { lat: number; lng: number } | null,
): UseFlyoverEntranceResult {
  const [flyoverComplete, setFlyoverComplete] = useState(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  });

  const mapRefHolder = useRef<MapRef | null>(null);
  const hasStarted = useRef(false);

  const flyoverActive = !flyoverComplete;

  const runFlyover = useCallback((map: MapRef, target: { lat: number; lng: number }) => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Step 1: Country overview (instant snap, then wait)
    map.jumpTo({
      center: COUNTRY_CENTER,
      zoom: 6.5,
      pitch: 0,
      bearing: 0,
    });

    // Step 2: City view (after a brief pause to let the user see the country)
    setTimeout(() => {
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: 10,
        pitch: 20,
        bearing: 0,
        duration: 1800,
        essential: true,
      });
    }, 600);

    // Step 3: Street level (after step 2 finishes)
    setTimeout(() => {
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: 15,
        pitch: 45,
        bearing: 0,
        duration: 2000,
        essential: true,
      });
    }, 600 + 1800 + 200);

    // Mark complete after full animation
    setTimeout(() => {
      setFlyoverComplete(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, 'true');
      }
    }, 600 + 1800 + 200 + 2000 + 300);
  }, []);

  const handleMapRef = useCallback((ref: MapRef) => {
    mapRefHolder.current = ref;

    if (!flyoverComplete && userLocation && !hasStarted.current) {
      runFlyover(ref, userLocation);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyoverComplete, userLocation]);

  // If user location arrives after map ref
  useEffect(() => {
    if (
      !flyoverComplete &&
      userLocation &&
      mapRefHolder.current &&
      !hasStarted.current
    ) {
      runFlyover(mapRefHolder.current, userLocation);
    }
  }, [userLocation, flyoverComplete, runFlyover]);

  return { flyoverComplete, flyoverActive, handleMapRef };
}
