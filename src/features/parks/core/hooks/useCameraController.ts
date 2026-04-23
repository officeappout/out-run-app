/**
 * useCameraController — Single owner of all Mapbox camera movements.
 *
 * Camera ownership model:
 *   'user'    → user manually panned/zoomed — block all automated camera
 *   'follow'  → active workout or navigation: follow with 75° pitch
 *   'preview' → idle: show route preview, destination, initial zoom (flat)
 */
import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { MapRef } from 'react-map-gl';
import type { Route } from '../types/route.types';

export type CameraOwner = 'user' | 'follow' | 'preview';

export interface CameraControllerParams {
  mapRef: React.RefObject<MapRef | null>;
  isMapLoaded: boolean;

  currentLocation: { lat: number; lng: number } | null | undefined;
  userBearing: number;
  speedKmH: number;

  isNavigationMode: boolean;
  isActiveWorkout: boolean;
  simulationActive: boolean;

  focusedRoute: Route | null | undefined;
  routes: Route[];
  destinationMarker: { lat: number; lng: number } | null | undefined;

  skipInitialZoom: boolean;

  isAutoFollowEnabled: boolean;
  onUserPanDetected: (() => void) | undefined;
}

export interface CameraControllerAPI {
  onMapReady: (rawMap: mapboxgl.Map) => void;
  recenter: () => void;
  owner: CameraOwner;
}

export function useCameraController(params: CameraControllerParams): CameraControllerAPI {
  const {
    mapRef, isMapLoaded, currentLocation, userBearing, speedKmH,
    isNavigationMode, isActiveWorkout, simulationActive,
    focusedRoute, routes, destinationMarker,
    skipInitialZoom, isAutoFollowEnabled, onUserPanDetected,
  } = params;

  const ownerRef = useRef<CameraOwner>('preview');
  const hasInitialZoomed = useRef(false);
  const prevSimActive = useRef(false);
  const rawMapRef = useRef<mapboxgl.Map | null>(null);

  const onUserPanDetectedRef = useRef(onUserPanDetected);
  useEffect(() => { onUserPanDetectedRef.current = onUserPanDetected; }, [onUserPanDetected]);

  // Detect TRANSITIONS only (false→true = recenter, true→false = user broke follow)
  const prevFollowEnabled = useRef(isAutoFollowEnabled);
  useEffect(() => {
    const was = prevFollowEnabled.current;
    prevFollowEnabled.current = isAutoFollowEnabled;
    if (!was && isAutoFollowEnabled) { ownerRef.current = 'follow'; }
    if (was && !isAutoFollowEnabled) { ownerRef.current = 'user'; }
  }, [isAutoFollowEnabled]);

  // Claim 'follow' when entering workout/nav; release to 'preview' on exit
  useEffect(() => {
    if ((isActiveWorkout || isNavigationMode) && ownerRef.current === 'preview') {
      ownerRef.current = 'follow';
    }
    if (!isActiveWorkout && !isNavigationMode && ownerRef.current === 'follow') {
      ownerRef.current = 'preview';
    }
  }, [isActiveWorkout, isNavigationMode]);

  // ── Waze-style padding (pushes center point up → Lemur sits low) ──
  const wazeBottomPadding = typeof window !== 'undefined'
    ? Math.round(window.innerHeight * 0.85)
    : 600;
  const wazePadding = useMemo(
    () => ({ top: 0, bottom: wazeBottomPadding, left: 0, right: 0 }),
    [wazeBottomPadding],
  );

  // ── Speed-adaptive zoom/pitch (only used during follow mode) ──
  const dynamicCamera = useMemo(() => {
    const SLOW = 7, FAST = 15;
    const t = (Math.max(SLOW, Math.min(FAST, speedKmH)) - SLOW) / (FAST - SLOW);
    return { zoom: 18.5 - t * 1.5, pitch: 75 - t * 15 };
  }, [speedKmH]);

  // ═══════════════════════════════════════════════════════
  // SINGLE CAMERA EFFECT
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const rawMap = map.getMap();
    if (!rawMap) return;

    const owner = ownerRef.current;

    // ── P0: Simulation start snap (one-shot) ──
    if (simulationActive && !prevSimActive.current && currentLocation) {
      ownerRef.current = 'follow';
      console.log('[Cam] sim-start snap');
      try {
        rawMap.jumpTo({
          center: [currentLocation.lng, currentLocation.lat],
          zoom: dynamicCamera.zoom, pitch: dynamicCamera.pitch,
          bearing: userBearing, padding: wazePadding,
        });
      } catch { /* ignore */ }
      prevSimActive.current = simulationActive;
      return;
    }
    prevSimActive.current = simulationActive;

    if (owner === 'user') return;

    // ── P1: Follow (workout / navigation / sim-in-discover) ──
    if (owner === 'follow' && currentLocation) {
      if (isNavigationMode) {
        console.log('[Cam] nav-follow');
        if (simulationActive) {
          rawMap.jumpTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: dynamicCamera.zoom, pitch: dynamicCamera.pitch,
            bearing: userBearing, padding: wazePadding,
          });
        } else {
          map.easeTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: dynamicCamera.zoom, pitch: dynamicCamera.pitch,
            bearing: userBearing, padding: wazePadding,
            duration: 500, easing: (t: number) => t, essential: true,
          });
        }
        return;
      }

      if (isActiveWorkout) {
        const wkZoom = Math.max(dynamicCamera.zoom - 0.5, 16.5);
        console.log('[Cam] workout-follow');
        if (simulationActive) {
          rawMap.jumpTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: wkZoom, pitch: dynamicCamera.pitch,
            bearing: userBearing, padding: wazePadding,
          });
        } else {
          map.easeTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: wkZoom, pitch: dynamicCamera.pitch,
            bearing: userBearing, padding: wazePadding,
            duration: 500, easing: (t: number) => t * (2 - t), essential: true,
          });
        }
        return;
      }

      // Sim in discover mode — still follow with 3D perspective
      if (simulationActive) {
        console.log('[Cam] sim-discover-follow');
        rawMap.jumpTo({
          center: [currentLocation.lng, currentLocation.lat],
          zoom: dynamicCamera.zoom, pitch: dynamicCamera.pitch,
          bearing: userBearing, padding: wazePadding,
        });
        return;
      }
    }

    // ── P2: Preview (flat, no 3D angle) ──
    if (owner === 'preview' || owner === 'follow') {
      const previewPath = focusedRoute?.path;
      if (previewPath && previewPath.length > 1 && !isActiveWorkout && !isNavigationMode) {
        try {
          const valid = previewPath.filter(
            (c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]),
          );
          if (valid.length >= 2) {
            const bounds = valid.reduce(
              (b, [lng, lat]) => [
                Math.min(b[0], lng), Math.min(b[1], lat),
                Math.max(b[2], lng), Math.max(b[3], lat),
              ],
              [valid[0][0], valid[0][1], valid[0][0], valid[0][1]],
            );
            console.log('[Cam] preview-fitBounds:', focusedRoute?.name);
            map.fitBounds(bounds as [number, number, number, number], {
              padding: { top: 100, bottom: 200, left: 100, right: 100 },
              duration: 1000,
            });
            return;
          }
        } catch { /* ignore */ }
      }

      const navRoutes = routes.filter((r) => r.id.startsWith('nav-') && r.path?.length > 1);
      if (navRoutes.length >= 2) {
        const allCoords = navRoutes
          .flatMap((r) => r.path)
          .filter((c) => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));
        if (allCoords.length >= 2) {
          try {
            const bounds = allCoords.reduce(
              ([minLng, minLat, maxLng, maxLat], [lng, lat]) => [
                Math.min(minLng, lng), Math.min(minLat, lat),
                Math.max(maxLng, lng), Math.max(maxLat, lat),
              ],
              [Infinity, Infinity, -Infinity, -Infinity],
            );
            console.log('[Cam] preview-fitBounds nav-variants');
            map.fitBounds(bounds as [number, number, number, number], {
              padding: { top: 80, bottom: 200, left: 80, right: 80 },
              duration: 1000,
            });
            return;
          } catch { /* ignore */ }
        }
      }

      if (destinationMarker && !focusedRoute && !isActiveWorkout && !isNavigationMode) {
        console.log('[Cam] flyTo destination');
        try {
          map.flyTo({
            center: [destinationMarker.lng, destinationMarker.lat],
            zoom: 15, pitch: 0,
            essential: true, duration: 2000,
          });
          return;
        } catch { /* ignore */ }
      }

      // Initial zoom — flat overview, NO 75° angle
      if (
        !skipInitialZoom &&
        !hasInitialZoomed.current &&
        currentLocation &&
        !focusedRoute &&
        !isActiveWorkout &&
        !destinationMarker
      ) {
        hasInitialZoomed.current = true;
        console.log('[Cam] initial-zoom (flat)');
        try {
          map.flyTo({
            center: [currentLocation.lng, currentLocation.lat],
            zoom: 15, pitch: 0,
            duration: 2000, essential: true,
          });
        } catch { /* ignore */ }
      }
    }
  }, [
    isMapLoaded, currentLocation, userBearing,
    isNavigationMode, isActiveWorkout, simulationActive,
    focusedRoute, routes, destinationMarker,
    skipInitialZoom, isAutoFollowEnabled,
    dynamicCamera, wazePadding, wazeBottomPadding, mapRef,
  ]);

  // ── onMapReady: wire interaction listeners ──
  const onMapReady = useCallback((rawMap: mapboxgl.Map) => {
    rawMapRef.current = rawMap;

    const breakFollow = () => {
      if (ownerRef.current !== 'user') {
        // Kill any in-flight camera animation to prevent "jump back"
        try { rawMap.stop(); } catch { /* ignore */ }
        ownerRef.current = 'user';
        onUserPanDetectedRef.current?.();
      }
    };

    const container = rawMap.getCanvasContainer();
    container.addEventListener('mousedown', breakFollow, { passive: true });
    container.addEventListener('wheel', breakFollow, { passive: true });
    container.addEventListener('touchstart', breakFollow, { passive: true });

    const canvas = rawMap.getCanvas();
    canvas.addEventListener('mousedown', breakFollow, { passive: true });
    canvas.addEventListener('wheel', breakFollow, { passive: true });

    rawMap.on('movestart', (evt: any) => {
      if (evt.originalEvent) breakFollow();
    });

    console.log('[Cam] listeners wired');
  }, []);

  const recenter = useCallback(() => {
    ownerRef.current = 'follow';
  }, []);

  return { onMapReady, recenter, owner: ownerRef.current };
}
