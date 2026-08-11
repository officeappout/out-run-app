'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useGPSStore, DEV_FALLBACK_LOCATION, type GPSCoords } from '../store/useGPSStore';
import { useIsForeground } from '@/lib/appForeground';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useUserStore } from '@/features/user';
import { IS_GPS_IDLE_POLLING_ENABLED } from '@/config/feature-flags';

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

// Idle-poll cadence (IS_GPS_IDLE_POLLING_ENABLED): while browsing with no
// active workout, a one-shot getCurrentPosition replaces the continuous
// watch every this-many ms instead of holding the chip engaged constantly.
const GPS_IDLE_POLL_INTERVAL_MS = 20_000;

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

export function useGPS(options?: { enabled?: boolean }): GPSState {
  // Defaults to true so the existing sole caller (useMapLogic.ts, mounted only
  // while MapShellInner/`/map` is mounted) keeps its exact current behaviour
  // when it doesn't pass the option. A second caller (GlobalGPSTracker) can
  // pass `enabled: false` to make this instance a fully inert no-op — it never
  // starts a watch/poll and never writes to useGPSStore — preserving the
  // store's documented single-driver contract: at most one enabled useGPS()
  // instance acquires/writes at any given moment.
  const enabled = options?.enabled ?? true;
  const [currentUserPos, setCurrentUserPos] = useState<GPSCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userBearing, setUserBearing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [simulationActive, setSimulationActive] = useState(false);

  // ── Battery guard (perf/batch1) ───────────────────────────────────────────
  // Pause the discovery GPS watch while the app is backgrounded — UNLESS a
  // workout/nav session is active, in which case the watch MUST keep running
  // so the run records with the screen off (the "full power during a session"
  // super-principle). Gating on session status, not blind screen-off, is the
  // hard exception the perf plan requires. When IS_PERF_BATCH1_ENABLED is off,
  // isForeground stays permanently true → gpsPaused is always false → identical
  // to prior always-on behaviour.
  const isForeground = useIsForeground();
  const sessionStatus = useSessionStore((s) => s.status);
  const workoutActive = sessionStatus === 'active' || sessionStatus === 'paused';
  const gpsPaused = !isForeground && !workoutActive;

  // For the browser (web) path
  const watchId = useRef<number | null>(null);
  // For the Capacitor (native) path — watchPosition returns a string callbackId
  const capWatchId = useRef<string | null>(null);
  const hasFallback = useRef(false);
  // Idle-poll interval handle (IS_GPS_IDLE_POLLING_ENABLED) — mutually
  // exclusive with watchId/capWatchId; only one acquisition mode runs at a time.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // GPS throttle state — shared between native and web paths
  const lastGPSTime = useRef<number>(0);
  const lastGPSPos = useRef<{ lat: number; lng: number } | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // [A2-SPIKE] TEMPORARY diagnostic — hook-level mount/unmount, independent of
  // the watch-lifecycle effect below. Tells us whether useGPS itself (and by
  // extension its caller, useMapLogic/MapShell) ever unmounts on in-app nav,
  // vs. staying mounted the whole time. Passive logging only — no behavior change.
  useEffect(() => {
    // callSite is a static label, not runtime-traced. useGPS() has two call
    // sites today: useMapLogic.ts:36 (MapShellInner, mounted only on /map,
    // always enabled=true) and GlobalGPSTracker (mounted once in ClientLayout,
    // behind GLOBAL_GPS_TRACKING_ENABLED, enabled only off /map during an
    // active running/walking/hybrid session) — mutually exclusive by the
    // isMapRoute check, so at most one instance is ever actually acquiring.
    // This log can now legitimately fire twice concurrently (both instances
    // mount) without an intervening UNMOUNTED when the flag is on.
    console.log('[A2-SPIKE][useGPS] hook mounted', { isNative, enabled });
    return () => {
      console.log('[A2-SPIKE][useGPS] hook UNMOUNTED');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Shared by every acquisition path (native watch, web watch, idle poll):
  // throttle + commit a raw fix into React state. Pulled out so the idle-poll
  // path (getCurrentPosition) funnels through the exact same gate as the
  // continuous watch instead of a third hand-rolled copy.
  const processFix = useCallback((coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    heading: number | null;
  }) => {
    const now = Date.now();
    const { latitude: newLat, longitude: newLng } = coords;
    const prev = lastGPSPos.current;
    if (now - lastGPSTime.current < GPS_MIN_INTERVAL_MS) return;
    if (prev && haversineMetres(prev.lat, prev.lng, newLat, newLng) < GPS_MIN_DISTANCE_M) return;
    lastGPSTime.current = now;
    lastGPSPos.current = { lat: newLat, lng: newLng };
    useGPSStore.getState()._setPermissionState('granted');
    setLocationError(null);
    setCurrentUserPos({ lat: newLat, lng: newLng, accuracy: coords.accuracy, altitude: coords.altitude ?? null });
    // [A2-SPIKE] Passive — confirms a fix was accepted, from ANY acquisition
    // path (native watch, web watch, or idle-poll) since they all funnel
    // through here. Single log site covers all of them, so nothing is missed
    // if the active mode switches mid-session (e.g. idle-poll -> watch on
    // workout start). NOT reading gpsMode/workoutActive here — this callback's
    // deps are [], so those would be stale-closure values; the periodic
    // "watch-effect run" log already reports current workoutActive/gpsMode.
    console.log('[A2-SPIKE][useGPS] fix accepted', { lat: newLat, lng: newLng, ts: now });
    if (coords.heading != null && Number.isFinite(coords.heading)) {
      setUserBearing(coords.heading);
    }
  }, []);

  // Idle-poll mode (IS_GPS_IDLE_POLLING_ENABLED): while browsing with no
  // active workout, a one-shot getCurrentPosition replaces the continuous
  // watch. Constant when the flag is off, so it never changes the effect's
  // dependency-driven behaviour below.
  const gpsMode = IS_GPS_IDLE_POLLING_ENABLED && !workoutActive ? 'idle-poll' : 'watch';

  useEffect(() => {
    // [A2-SPIKE] TEMPORARY diagnostic — logged every time this effect
    // (re-)runs, i.e. on every dependency change
    // [simulationActive, isNative, gpsPaused]. Key question: during an
    // active run, does gpsPaused ever flip true (which would tear down the
    // native/web watch via the battery guard below) even though
    // workoutActive should hold it open?
    console.log('[A2-SPIKE][useGPS] watch-effect run', {
      enabled,
      simulationActive,
      gpsPaused,
      isForeground,
      workoutActive,
      sessionStatus,
      isNative,
    });

    if (!enabled || simulationActive || gpsPaused) {
      // [A2-SPIKE] Battery-guard / sim teardown branch — distinct from the
      // unmount cleanup functions below. If this fires DURING an active run
      // with workoutActive===true logged false above, that's hypothesis (b):
      // the battery guard itself is the culprit, not a component unmount.
      console.log('[A2-SPIKE][useGPS] battery-guard/sim teardown', {
        reason: !enabled ? 'disabled' : simulationActive ? 'simulationActive' : 'gpsPaused',
        isNative,
        hadNativeWatch: capWatchId.current != null,
        hadWebWatch: watchId.current != null,
      });
      // Kill any active watcher. Either the mock position drives the UI
      // (simulationActive), or we're paused in the background with no active
      // workout (gpsPaused battery guard). On resume the effect re-runs and
      // re-establishes the watch — the fresh watchPosition delivers an
      // immediate first fix, satisfying "instant GPS on foreground".
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
      if (pollTimer.current != null) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setLocationError(null);
      return;
    }

    // ── Idle-poll path (IS_GPS_IDLE_POLLING_ENABLED, no active workout) ─────
    // Same getCurrentPosition already used by handleLocationClick below, just
    // on a slow interval instead of a one-off tap. Reaches iOS's sane
    // kCLLocationAccuracyBest tier (only available on this one-shot path —
    // watchPosition's JS options only reach BestForNavigation or the useless
    // ThreeKilometers tier) and lets the chip idle between fixes instead of
    // being held in a continuous subscription.
    if (gpsMode === 'idle-poll') {
      // Guards a poll's async result landing after this effect instance has
      // already torn down (e.g. a workout started mid-request) — mirrors the
      // `active` flag the native watch path below already uses for the same
      // class of race, so a late idle fix can't stomp a fresh watch-mode one.
      let active = true;

      const poll = () => {
        if (isNative) {
          Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 })
            .then((pos) => {
              if (!active) return;
              if (!isValidCapacitorCoords(pos.coords)) return;
              processFix({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude ?? null,
                heading: pos.coords.heading ?? null,
              });
            })
            .catch((err) => {
              if (!active) return;
              applyFallback();
              setLocationError(err instanceof Error ? err.message : 'Location unavailable');
              // getCurrentPosition's rejection doesn't reliably carry a
              // permission-denied signal the way the web error.code does —
              // ask the plugin directly so a revoked permission still
              // surfaces to permissionState-gated UI (e.g. "enable in
              // Settings") instead of silently staying at its last value.
              Geolocation.checkPermissions()
                .then((perm) => {
                  if (!active) return;
                  useGPSStore.getState()._setPermissionState(
                    perm.location === 'granted' ? 'granted' : perm.location === 'denied' ? 'denied' : 'prompt',
                  );
                })
                .catch(() => {});
            });
          return;
        }
        if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!active) return;
            if (!isValidGeoSample(pos.coords)) return;
            processFix({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude ?? null,
              heading: pos.coords.heading ?? null,
            });
          },
          (error) => {
            if (!active) return;
            applyFallback();
            setLocationError(error.message);
            useGPSStore.getState()._setPermissionState(error.code === 1 ? 'denied' : 'prompt');
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
        );
      };

      poll(); // immediate fix on entering idle mode — no up-to-20s stale gap
      pollTimer.current = setInterval(poll, GPS_IDLE_POLL_INTERVAL_MS);

      return () => {
        active = false;
        if (pollTimer.current != null) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      };
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
              processFix({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude ?? null,
                heading: pos.coords.heading ?? null,
              });
            },
          );
          // [A2-SPIKE] Native watch established (or re-established after an
          // effect re-run).
          console.log('[A2-SPIKE][useGPS] native watch ESTABLISHED', { capWatchId: capWatchId.current });
        } catch (err) {
          console.warn('[useGPS] Capacitor Geolocation error:', err);
          applyFallback();
        }
      };

      startNativeWatch();

      return () => {
        // [A2-SPIKE] Native watch-effect cleanup — fires on unmount OR when
        // the effect re-runs due to a dep change [simulationActive, isNative,
        // gpsPaused]. If this fires DURING an active run with no matching
        // "hook UNMOUNTED" log nearby, the effect re-ran (dep flip), not a
        // real unmount — points at gpsPaused/isForeground as the culprit.
        console.log('[A2-SPIKE][useGPS] native watch-effect cleanup', {
          hadNativeWatch: capWatchId.current != null,
        });
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

    // [A2-SPIKE] Web watch established — mirrors the native "watch ESTABLISHED"
    // log so the two paths are symmetric for on-device diagnosis.
    console.log('[A2-SPIKE][useGPS] web watch ESTABLISHED');

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (simulationActive) return;
        if (!isValidGeoSample(pos.coords)) {
          console.warn('[useGPS] Dropping invalid GPS sample:', pos.coords);
          return;
        }
        processFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude ?? null,
          heading: pos.coords.heading ?? null,
        });
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
      // [A2-SPIKE] Web watch-effect cleanup — same caveat as the native one
      // above: fires on unmount OR on dep re-run, not exclusively on unmount.
      console.log('[A2-SPIKE][useGPS] web watch-effect cleanup', {
        hadWebWatch: watchId.current != null,
      });
      if (devFallbackTimer !== null) clearTimeout(devFallbackTimer);
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch { /* ignore */ }
        watchId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationActive, isNative, gpsPaused, gpsMode, enabled]);

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
