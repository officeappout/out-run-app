'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useGPSStore, DEV_FALLBACK_LOCATION, type GPSCoords } from '../store/useGPSStore';
import { useUserStore } from '@/features/user';

/**
 * Resolve where to place the user when a real GPS fix is unavailable. NO invented
 * fixed coordinate (the old Sderot seed) — instead, in priority order:
 *   1. Last valid fix this session (a momentary error shouldn't teleport the user).
 *   2. The user's onboarding/authority anchor (profile.core.anchor* → their city).
 *   3. The pre-profile onboarding anchor stashed in sessionStorage.
 *   4. DEV ONLY: the shared Tel-Aviv dev fallback (same source as usePresenceLayer).
 *   5. Production with none of the above → null: no teleport; the UI prompts to
 *      enable location instead.
 */
function resolveFallbackLocation(lastKnown: { lat: number; lng: number } | null): GPSCoords | null {
  if (lastKnown && Number.isFinite(lastKnown.lat) && Number.isFinite(lastKnown.lng)) {
    return { lat: lastKnown.lat, lng: lastKnown.lng };
  }
  const core = useUserStore.getState().profile?.core as { anchorLat?: number; anchorLng?: number } | undefined;
  if (typeof core?.anchorLat === 'number' && typeof core?.anchorLng === 'number'
    && Number.isFinite(core.anchorLat) && Number.isFinite(core.anchorLng)) {
    return { lat: core.anchorLat, lng: core.anchorLng };
  }
  if (typeof window !== 'undefined') {
    const s = sessionStorage.getItem('selected_anchor_lat');
    const t = sessionStorage.getItem('selected_anchor_lng');
    if (s && t) {
      const lat = parseFloat(s), lng = parseFloat(t);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  if (process.env.NODE_ENV === 'development') return { ...DEV_FALLBACK_LOCATION };
  return null; // production, no anchor → no teleport; surface the error, prompt for location
}

// Minimum elapsed time (ms) between GPS state updates. iOS CLLocationManager
// with enableHighAccuracy can fire at ~1 Hz or faster. Throttling to 2 Hz
// max prevents excessive re-renders and Mapbox repaints on WKWebView.
const GPS_MIN_INTERVAL_MS = 500;

// Minimum distance (metres) to move before accepting a new position update.
// Filters out GPS jitter when the user is stationary.
const GPS_MIN_DISTANCE_M = 3;

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

/** Same guard for the object shape that @capacitor/geolocation returns */
function isValidCapacitorCoords(coords: { latitude: number; longitude: number } | null | undefined): boolean {
  if (!coords) return false;
  return Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
    && !(coords.latitude === 0 && coords.longitude === 0);
}

export interface GPSState {
  currentUserPos: GPSCoords | null;
  setCurrentUserPos: (pos: GPSCoords | null) => void;
  locationError: string | null;
  userBearing: number;
  isFollowing: boolean;
  handleLocationClick: () => void;
  setSimulationActive: (active: boolean) => void;
}

export function useGPS(): GPSState {
  const [currentUserPos, setCurrentUserPos] = useState<GPSCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userBearing, setUserBearing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [simulationActive, setSimulationActive] = useState(false);

  // For the browser (web) path
  const watchId = useRef<number | null>(null);
  // For the Capacitor (native) path — watchPosition returns a string callbackId
  const capWatchId = useRef<string | null>(null);
  const hasFallback = useRef(false);

  // GPS throttle state — shared between native and web paths
  const lastGPSTime = useRef<number>(0);
  const lastGPSPos = useRef<{ lat: number; lng: number } | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // Apply the best available fallback (last-known → anchor → dev Tel-Aviv → none).
  // Never teleports to a hard-coded coordinate; in production with no anchor it
  // leaves the position null so the UI can prompt to enable location.
  const applyFallback = useCallback(() => {
    if (hasFallback.current) return;
    const fb = resolveFallbackLocation(lastGPSPos.current);
    if (fb) {
      hasFallback.current = true;
      setCurrentUserPos(fb);
    }
  }, []);

  useEffect(() => {
    if (simulationActive) {
      // Kill any active watcher — mock position drives the UI instead.
      if (isNative) {
        if (capWatchId.current != null) {
          Geolocation.clearWatch({ id: capWatchId.current }).catch(() => {});
          capWatchId.current = null;
        }
      } else {
        if (watchId.current != null) {
          try { navigator.geolocation.clearWatch(watchId.current); } catch { /* ignore */ }
          watchId.current = null;
        }
      }
      setLocationError(null);
      return;
    }

    // ── Native path (iOS / Android) ────────────────────────────────────────
    // Uses the Capacitor Geolocation plugin which calls CLLocationManager
    // directly. This uses the system-level location permission (stored in
    // iOS Settings) rather than WKWebView's per-origin web permission —
    // which is session-based and re-prompts on every app launch.
    if (isNative) {
      if (capWatchId.current != null) return; // already watching

      let active = true;

      const startNativeWatch = async () => {
        try {
          // Request permission once. On subsequent launches iOS returns
          // 'granted' immediately — no dialog — because the permission
          // is stored in Settings.app, not in WKWebView's session state.
          const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
          if (perm.location !== 'granted') {
            applyFallback();
            setLocationError('Location permission denied');
            useGPSStore.getState()._setPermissionState('denied');
            return;
          }
          useGPSStore.getState()._setPermissionState('granted');

          capWatchId.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
            (pos, err) => {
              if (!active) return;
              if (err || !pos) {
                applyFallback();
                if (err) setLocationError(err.message);
                return;
              }
              if (!isValidCapacitorCoords(pos.coords)) {
                console.warn('[useGPS] Dropping invalid Capacitor GPS sample:', pos.coords);
                return;
              }
              // Throttle: skip updates that arrive too soon or haven't moved enough.
              const now = Date.now();
              const newLat = pos.coords.latitude;
              const newLng = pos.coords.longitude;
              const prev = lastGPSPos.current;
              if (now - lastGPSTime.current < GPS_MIN_INTERVAL_MS) return;
              if (prev && haversineMetres(prev.lat, prev.lng, newLat, newLng) < GPS_MIN_DISTANCE_M) return;
              lastGPSTime.current = now;
              lastGPSPos.current = { lat: newLat, lng: newLng };
              setLocationError(null);
              setCurrentUserPos({ lat: newLat, lng: newLng, accuracy: pos.coords.accuracy, altitude: pos.coords.altitude ?? null });
              if (pos.coords.heading != null && Number.isFinite(pos.coords.heading)) {
                setUserBearing(pos.coords.heading);
              }
            },
          );
        } catch (err) {
          console.warn('[useGPS] Capacitor Geolocation error:', err);
          applyFallback();
        }
      };

      startNativeWatch();

      return () => {
        active = false;
        if (capWatchId.current != null) {
          Geolocation.clearWatch({ id: capWatchId.current }).catch(() => {});
          capWatchId.current = null;
        }
      };
    }

    // ── Web / browser path ─────────────────────────────────────────────────
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      applyFallback();
      return;
    }

    // Fix #3a: use watchPosition (not one-shot getCurrentPosition) so we receive
    // continuous position AND heading updates from the device compass.
    if (watchId.current != null) return; // already watching

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (simulationActive) return;
        if (!isValidGeoSample(pos.coords)) {
          console.warn('[useGPS] Dropping invalid GPS sample:', pos.coords);
          return;
        }
        // Throttle: skip updates that arrive too soon or haven't moved enough.
        const now = Date.now();
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const prev = lastGPSPos.current;
        if (now - lastGPSTime.current < GPS_MIN_INTERVAL_MS) return;
        if (prev && haversineMetres(prev.lat, prev.lng, newLat, newLng) < GPS_MIN_DISTANCE_M) return;
        lastGPSTime.current = now;
        lastGPSPos.current = { lat: newLat, lng: newLng };
        setLocationError(null);
        setCurrentUserPos({ lat: newLat, lng: newLng, accuracy: pos.coords.accuracy, altitude: pos.coords.altitude ?? null });
        useGPSStore.getState()._setPermissionState('granted');
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setUserBearing(pos.coords.heading);
        }
      },
      (error) => {
        if (simulationActive) return;
        applyFallback();
        setLocationError(error.message);
        useGPSStore.getState()._setPermissionState(error.code === 1 ? 'denied' : 'prompt');
        if (error.code !== 3) {
          console.warn('[useGPS] Geolocation error', error.code, error.message);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    // Dev-only: if the browser permission dialog is left pending (no grant/deny),
    // the error callback never fires and the map stays blank. Apply the fallback
    // (anchor → dev Tel-Aviv) after 5s so presence heartbeats / group-session tests
    // work without a real GPS fix. lastGPSPos.current is set by the success callback —
    // if it's still null after 5s, no real position arrived and the fallback is safe.
    let devFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (process.env.NODE_ENV === 'development') {
      devFallbackTimer = setTimeout(() => {
        if (!hasFallback.current && lastGPSPos.current === null) {
          console.info('[useGPS] dev: no GPS fix in 5s — applying fallback (anchor/dev) for local testing');
          applyFallback();
        }
      }, 5000);
    }

    return () => {
      if (devFallbackTimer !== null) clearTimeout(devFallbackTimer);
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch { /* ignore */ }
        watchId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationActive, isNative]);

  const handleLocationClick = useCallback(() => {
    if (simulationActive) return;
    setIsFollowing((prev) => !prev);

    if (isNative) {
      Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
        .then((pos) => {
          if (simulationActive) return;
          if (!isValidCapacitorCoords(pos.coords)) return;
          setLocationError(null);
          setCurrentUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          if (pos.coords.heading != null && Number.isFinite(pos.coords.heading)) {
            setUserBearing(pos.coords.heading);
          }
        })
        .catch(() => { /* silent on manual retry */ });
      return;
    }

    if (!('geolocation' in navigator)) return;
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
  }, [simulationActive, isNative]);

  // ── Mirror into useGPSStore ──────────────────────────────────────────────
  // useGPS is the sole GPS driver; these effects push the canonical fix and
  // error into the shared store so every other feature can read coordinates
  // without opening its own watcher / permission prompt. Covers all paths
  // (native success, web success, and the Sderot fallback) in one place.
  useEffect(() => {
    useGPSStore.getState()._setCoords(currentUserPos);
  }, [currentUserPos]);

  useEffect(() => {
    useGPSStore.getState()._setLocationError(locationError);
  }, [locationError]);

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
