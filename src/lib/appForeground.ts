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
  /** Timestamp (ms) of the last native memory-warning shed signal; 0 if none. */
  lastMemoryWarningAt: number;
  /** Internal setter — no-ops when the value is unchanged. */
  _setForeground: (v: boolean) => void;
  /** Internal — record a native memory-pressure signal. */
  _signalMemoryWarning: () => void;
}

export const useAppForegroundStore = create<AppForegroundState>((set) => ({
  isForeground: true,
  lastMemoryWarningAt: 0,
  _setForeground: (v) =>
    set((s) => (s.isForeground === v ? s : { isForeground: v })),
  _signalMemoryWarning: () => set({ lastMemoryWarningAt: Date.now() }),
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

  // ── Native memory-pressure shed (Stage 3 Part A) ─────────────────────────
  // iOS posts a `memoryWarning` window event (ViewController.didReceiveMemory-
  // Warning → bridge.triggerWindowJSEvent). Surface it as a store signal so map
  // consumers can shed heavy state (markers/tiles) before pressure becomes a
  // web-content OOM. Best-effort: the host warning often does NOT fire for
  // web-content jetsam — the native Part B recovery is the real loop-breaker.
  window.addEventListener('memoryWarning', () => {
    console.warn('[appForeground] native memoryWarning → shed signal');
    useAppForegroundStore.getState()._signalMemoryWarning();
  });

  // ── Heat investigation — real thermal-state diagnostic (11.08.2026) ─────
  // iOS posts a `thermalStateChanged` window event (ViewController.notifyThermalState
  // → bridge.triggerWindowJSEvent, seeded once on load + on every real change) carrying
  // the OS's actual ProcessInfo.thermalState (nominal/fair/serious/critical — the same
  // tiers iOS itself uses to throttle CPU/GPU). Diagnostic only, console-only, not wired
  // to any store/shedding behavior — answers "is the phone objectively hot" without
  // relying on inferring it from workload. NATIVE-ONLY: requires a new iOS build to
  // reach a device (ViewController.swift change, not deployable via a web push alone —
  // axioms.md §10). Safe to remove once the investigation is done.
  window.addEventListener('thermalStateChanged', (e) => {
    // NOT a CustomEvent — Capacitor's native-bridge `triggerEvent` spreads the data
    // object's own keys directly onto the Event instance (`ev[key] = value`), not into
    // `event.detail`. Confirmed by reading native-bridge.js's `createEvent` directly.
    const state = (e as unknown as { state?: string }).state;
    console.log(`[thermal] state=${state ?? 'unknown'}`);
  });

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

/**
 * Subscribe to native memory-pressure signals (Stage 3 Part A). Returns the
 * timestamp (ms) of the last `memoryWarning`, or 0. A map consumer can watch
 * this to shed heavy state under pressure. (Concrete shedding is a follow-up
 * once we confirm host warnings actually fire on device — Part B handles the
 * real web-content OOM.)
 */
export function useLastMemoryWarningAt(): number {
  return useAppForegroundStore((s) => s.lastMemoryWarningAt);
}
