'use client';

/**
 * appForeground — single source of truth for "is the app currently visible
 * and active" (foreground) vs. backgrounded / hidden.
 *
 * Battery/heat guard (perf/batch1): when the app is backgrounded, high-drain
 * map subsystems pause —
 *   • the map presence heartbeat  (presence.service.ts)
 *   • the partner-finder listeners (usePartnerData.ts)
 *   • the discovery GPS watch      (useGPS.ts)
 * — and resume, with an immediate refresh, the instant the app returns to the
 * foreground. The GPS watch has a HARD EXCEPTION: it is never paused while a
 * workout/nav session is active, so a run keeps recording with the screen off.
 *
 * Two signals, unioned into one boolean:
 *   • Web / WKWebView — `document.visibilitychange`.
 *   • Native (iOS/Android) — Capacitor `App.appStateChange`.
 *
 * Gated behind IS_PERF_BATCH1_ENABLED. When the flag is off the tracker
 * never initialises and `isForeground` stays permanently `true`, so every
 * consumer behaves exactly as it did before this change — callers can treat
 * `!isForeground` as the sole pause trigger without importing the flag.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { IS_PERF_BATCH1_ENABLED } from '@/config/feature-flags';

interface AppForegroundState {
  isForeground: boolean;
  /** Internal setter — no-ops when the value is unchanged. */
  _setForeground: (v: boolean) => void;
}

export const useAppForegroundStore = create<AppForegroundState>((set) => ({
  isForeground: true,
  _setForeground: (v) =>
    set((s) => (s.isForeground === v ? s : { isForeground: v })),
}));

// Synchronous native check via the global Capacitor object — mirrors the
// SettingsModal helper. Avoids a top-level `@capacitor/*` import (axiom §4:
// Capacitor packages are dynamic-import-only to keep webpack from hanging).
function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

let _initialized = false;

/**
 * Idempotent singleton initialiser. Attaches the visibility + app-state
 * listeners once for the app's lifetime. They are passive and cheap, so they
 * are intentionally never torn down — this avoids races between the multiple
 * map consumers that mount/unmount independently.
 */
export function initAppForegroundTracking(): void {
  if (_initialized) return;
  if (typeof document === 'undefined') return; // SSR guard
  _initialized = true;

  const set = (v: boolean) => useAppForegroundStore.getState()._setForeground(v);

  // ── Web / WKWebView ──────────────────────────────────────────────────────
  const onVisibility = () => set(!document.hidden);
  document.addEventListener('visibilitychange', onVisibility);
  set(!document.hidden); // seed from the current state

  // ── Native (Capacitor) — dynamic import per axiom §4 ─────────────────────
  if (isNativeApp()) {
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        await App.addListener('appStateChange', ({ isActive }) => set(isActive));
      } catch (err) {
        console.warn('[appForeground] native appStateChange attach failed:', err);
      }
    })();
  }
}

/**
 * Subscribe to foreground state. Returns `true` (always-foreground) when the
 * background guard flag is off — so consumers can key their pause logic solely
 * on `!isForeground` and remain no-ops when the guard is disabled.
 */
export function useIsForeground(): boolean {
  useEffect(() => {
    if (!IS_PERF_BATCH1_ENABLED) return;
    initAppForegroundTracking();
  }, []);
  return useAppForegroundStore((s) => s.isForeground);
}
