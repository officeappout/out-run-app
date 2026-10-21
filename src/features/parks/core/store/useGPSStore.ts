'use client';

/**
 * useGPSStore — single source of truth for the device's live GPS fix.
 *
 * Architecture contract:
 *   • `useGPS.ts` is the ONLY driver. It runs the Capacitor (native) /
 *     `navigator.geolocation.watchPosition` (web) watcher and pushes every
 *     accepted fix into this store via the `_set*` writers below.
 *   • Every other feature is a READER. Components/hooks subscribe to `coords`
 *     and must NOT call `navigator.geolocation` or `Geolocation` themselves.
 *     This prevents the app from firing a location prompt on the very first
 *     second of launch from a dozen independent mount effects.
 *   • The only sanctioned action-driven permission request is
 *     `requestPermissionNow()` — used by explicit user taps (onboarding GPS
 *     button, settings toggle, home checklist) where prompting is intended.
 *
 * State here is intentionally ephemeral — NOT persisted. A stale GPS fix from
 * a previous session would be worse than no fix, so there is no `persist`
 * middleware and no `skipHydration` concern.
 */

import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * DEV-ONLY fallback location (Tel Aviv). Used when localhost has no real GPS fix
 * so presence heartbeats / group tests work. SINGLE SOURCE — both `useGPS` (on
 * geolocation error) and `usePresenceLayer` reference this so the dev fallback is
 * consistent. NEVER applied in production (guarded by NODE_ENV / IS_DEV).
 */
export const DEV_FALLBACK_LOCATION = { lat: 32.0673, lng: 34.7726 } as const;

export type GPSPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt';

export interface GPSCoords {
  lat: number;
  lng: number;
  /** GPS fix accuracy in metres. Absent on FALLBACK_SDEROT or when the driver lacks it. */
  accuracy?: number;
  /** Altitude in metres above sea level. Null when the device doesn't provide it. Absent on fallback. */
  altitude?: number | null;
}

/** Options for a single one-shot fix (mirrors PositionOptions). */
export interface GPSFixOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

/**
 * Outcome of `requestFix`. `denied` = the user/OS refused permission;
 * `unavailable` = permission is fine but no fix arrived (timeout, no signal,
 * unsupported) — callers may retry with different options.
 */
export interface GPSFixResult {
  coords: GPSCoords | null;
  reason: 'ok' | 'denied' | 'unavailable';
}

interface GPSStore {
  /** Latest accepted GPS fix, or null until the first fix arrives. */
  coords: GPSCoords | null;
  /** Best-known permission state. `unknown` until the driver resolves it. */
  permissionState: GPSPermissionState;
  /** Human-readable last error, or null. Mirrors `useGPS.locationError`. */
  locationError: string | null;

  // ── Driver-only writers (called exclusively by useGPS.ts) ──────────────
  _setCoords: (coords: GPSCoords | null) => void;
  _setPermissionState: (state: GPSPermissionState) => void;
  _setLocationError: (error: string | null) => void;

  /**
   * Action-driven permission request. Triggers the OS dialog (native) or the
   * browser prompt (web) ON DEMAND and resolves with the resulting coordinates,
   * or null when the user denies / the device is unavailable. Always updates
   * `permissionState` and `coords` as a side effect so readers stay in sync.
   */
  requestPermissionNow: () => Promise<GPSCoords | null>;

  /**
   * Soft, courtesy fetch for premium "see nearby things" surfaces. Triggers a
   * prompt ONLY when we don't already have a fix AND the user hasn't explicitly
   * denied us before (`unknown` / `prompt`). If permission is `denied` or a fix
   * already exists, it resolves immediately with the current coords (or null)
   * WITHOUT re-prompting — so denied users are never nagged.
   */
  requestPermissionIfAllowed: () => Promise<GPSCoords | null>;

  /**
   * Same on-demand prompt as `requestPermissionNow`, but with caller-chosen
   * accuracy / timeout / cache options and a result that tells a denial apart
   * from a mere timeout. Used by the onboarding location step (v2) to get a
   * fast coarse fix first and refine it afterwards. Unlike
   * `requestPermissionNow`, a timeout never flips `permissionState` to
   * `denied` — only a real refusal does.
   */
  requestFix: (options: GPSFixOptions) => Promise<GPSFixResult>;

  /**
   * Permission ONLY — no fix. Native: the OS dialog (Capacitor requestPermissions),
   * resolving with the user's answer. Web: the Permissions API's current state when
   * it already is granted / denied; otherwise 'unknown' (on the web the prompt only
   * comes with the fix request itself). Lets a caller wait for the user's answer
   * before starting an animation (onboarding entry globe: ask → answer → dive).
   */
  requestLocationPermission: () => Promise<'granted' | 'denied' | 'unknown'>;
}

export const useGPSStore = create<GPSStore>((set, get) => ({
  coords: null,
  permissionState: 'unknown',
  locationError: null,

  _setCoords: (coords) => set({ coords }),
  _setPermissionState: (permissionState) => set({ permissionState }),
  _setLocationError: (locationError) => set({ locationError }),

  requestPermissionIfAllowed: async () => {
    const { coords, permissionState, requestPermissionNow } = get();
    // Already have a fix — reuse it, never re-prompt.
    if (coords) return coords;
    // Respect a prior explicit denial — fall back silently.
    if (permissionState === 'denied') return null;
    // 'unknown' / 'prompt' → courtesy prompt.
    return requestPermissionNow();
  },

  requestLocationPermission: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (perm.location === 'granted') {
          set({ permissionState: 'granted' });
          return 'granted';
        }
        // Android "approximate only": answered, but the fix path owns that verdict.
        if (perm.coarseLocation === 'granted') return 'unknown';
        set({ permissionState: 'denied', locationError: 'Location permission denied' });
        return 'denied';
      } catch {
        // Location services off / plugin error — let the fix request report it.
        return 'unknown';
      }
    }
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
      if (status?.state === 'granted') return 'granted';
      if (status?.state === 'denied') {
        set({ permissionState: 'denied' });
        return 'denied';
      }
    } catch {
      /* no Permissions API (older WebViews) */
    }
    return 'unknown';
  },

  requestFix: async ({ enableHighAccuracy, timeout, maximumAge }) => {
    // ── Native path (iOS / Android) — Capacitor Geolocation ──────────────
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (perm.location !== 'granted') {
          set({ permissionState: 'denied', locationError: 'Location permission denied' });
          return { coords: null, reason: 'denied' };
        }
      } catch (err) {
        set({
          permissionState: 'denied',
          locationError: err instanceof Error ? err.message : 'GPS error',
        });
        return { coords: null, reason: 'denied' };
      }
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout, maximumAge });
        const coords: GPSCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
        };
        set({ coords, permissionState: 'granted', locationError: null });
        return { coords, reason: 'ok' };
      } catch (err) {
        // Permission was granted above — this is a timeout / no-signal error.
        set({
          permissionState: 'granted',
          locationError: err instanceof Error ? err.message : 'GPS error',
        });
        return { coords: null, reason: 'unavailable' };
      }
    }

    // ── Web path — browser geolocation prompt ────────────────────────────
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      set({ locationError: 'Geolocation unsupported' });
      return { coords: null, reason: 'unavailable' };
    }

    return new Promise<GPSFixResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: GPSCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
          };
          set({ coords, permissionState: 'granted', locationError: null });
          resolve({ coords, reason: 'ok' });
        },
        (error) => {
          if (error.code === 1) {
            set({ permissionState: 'denied', locationError: error.message });
            resolve({ coords: null, reason: 'denied' });
          } else {
            set({ locationError: error.message });
            resolve({ coords: null, reason: 'unavailable' });
          }
        },
        { enableHighAccuracy, timeout, maximumAge },
      );
    });
  },

  requestPermissionNow: async () => {
    // ── Native path (iOS / Android) — Capacitor Geolocation ──────────────
    // Uses the system-level permission stored in Settings.app rather than
    // WKWebView's session-scoped web permission.
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (perm.location !== 'granted') {
          set({ permissionState: 'denied', locationError: 'Location permission denied' });
          return null;
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        set({ coords, permissionState: 'granted', locationError: null });
        return coords;
      } catch (err) {
        set({
          permissionState: 'denied',
          locationError: err instanceof Error ? err.message : 'GPS error',
        });
        return null;
      }
    }

    // ── Web path — browser geolocation prompt ────────────────────────────
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      set({ locationError: 'Geolocation unsupported' });
      return null;
    }

    return new Promise<GPSCoords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          set({ coords, permissionState: 'granted', locationError: null });
          resolve(coords);
        },
        (error) => {
          set({
            permissionState: error.code === 1 ? 'denied' : 'prompt',
            locationError: error.message,
          });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  },
}));
