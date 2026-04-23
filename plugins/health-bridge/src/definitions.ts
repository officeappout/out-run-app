/**
 * HealthBridge plugin — public TypeScript surface.
 *
 * Implemented natively by:
 *   • iOS    — ios/Plugin/HealthBridgePlugin.swift   (HealthKit)
 *   • Android — android/.../HealthBridgePlugin.kt    (Health Connect)
 *
 * The web shim (web.ts) is a no-op so that the same code compiles for
 * the Vercel deployment without pulling in any native bridge.
 */

import type { PluginListenerHandle } from '@capacitor/core';

/**
 * A single health sample as collected by the OS. We deliberately keep
 * the surface tiny and match the shape that ingestHealthSamples expects
 * server-side (see functions/src/ingestHealthSamples.ts).
 */
export interface HealthSample {
  /** Stable UUID assigned by the OS (or a derived sha1 if missing). */
  sampleUUID: string;
  /** ISO-8601 string. Inclusive sample start. */
  startISO: string;
  /** ISO-8601 string. Exclusive sample end. */
  endISO: string;
  /** ISO date "YYYY-MM-DD" in the device's current timezone. */
  date: string;
  /** Step count over the interval (integer ≥ 0). */
  steps: number;
  /** Active calories kcal over the interval (integer ≥ 0). */
  calories: number;
  /** Active minutes over the interval (integer ≥ 0). */
  activeMinutes: number;
  /** Source label, e.g. "iPhone", "Apple Watch", "Pixel". */
  source?: string;
}

export type HealthPermission = 'steps' | 'activeEnergy' | 'exerciseTime';

export interface RequestPermissionsOptions {
  permissions: HealthPermission[];
}

export interface RequestPermissionsResult {
  granted: HealthPermission[];
  denied: HealthPermission[];
}

export interface HasPermissionsResult {
  granted: boolean;
}

export interface SyncSinceOptions {
  /** Inclusive ISO-8601 lower bound. Defaults to "since last sync". */
  sinceISO?: string;
  /**
   * Optional upper bound — used by background workers to clip a window
   * (e.g. last 6h) so we don't replay months of data on first install.
   */
  untilISO?: string;
}

export interface SyncSinceResult {
  samples: HealthSample[];
  /** ISO timestamp the OS confirms data is complete up to. */
  cursorISO: string;
}

export interface OnSamplesAvailableEvent {
  /** Reason the OS woke us. */
  reason: 'foreground' | 'background' | 'observer' | 'manual';
  /** ISO timestamp the OS suggests as the new cursor. */
  cursorISO: string;
}

export interface HealthBridgePlugin {
  /** Returns true on iOS 14+ and Android API 26+ with Health Connect installed. */
  isAvailable(): Promise<{ available: boolean; reason?: string }>;

  hasPermissions(options: RequestPermissionsOptions): Promise<HasPermissionsResult>;
  requestPermissions(options: RequestPermissionsOptions): Promise<RequestPermissionsResult>;

  /**
   * Pull samples since the cursor (or since `sinceISO`). Returns up to
   * 1000 samples; caller must page if more are needed.
   */
  syncSince(options?: SyncSinceOptions): Promise<SyncSinceResult>;

  /**
   * Enable observer queries (iOS) / periodic WorkManager job (Android)
   * so the OS can wake the app when new samples arrive.
   */
  enableBackgroundDelivery(): Promise<void>;
  disableBackgroundDelivery(): Promise<void>;

  /**
   * Fired when the OS reports new samples are available. The web
   * listener should call `syncSince()` to actually pull them.
   */
  addListener(
    eventName: 'samplesAvailable',
    listenerFunc: (event: OnSamplesAvailableEvent) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  removeAllListeners(): Promise<void>;
}
