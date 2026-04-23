import { WebPlugin } from '@capacitor/core';

import type {
  HealthBridgePlugin,
  HasPermissionsResult,
  RequestPermissionsOptions,
  RequestPermissionsResult,
  SyncSinceOptions,
  SyncSinceResult,
} from './definitions';

/**
 * Web fallback — intentionally a no-op.
 *
 * On the pure-web build there is no HealthKit / Health Connect, so:
 *   • isAvailable()           returns { available: false }
 *   • hasPermissions()         returns { granted: false }
 *   • requestPermissions()     denies everything
 *   • syncSince()              returns an empty sample set
 *   • enableBackgroundDelivery is a resolved promise
 *
 * This lets the same UI (`useLiveDailyActivity`, ActivityRingsWidget)
 * mount on both platforms — the rings simply show Firestore data on
 * web and live-overlay data inside the native shell.
 */
export class HealthBridgeWeb extends WebPlugin implements HealthBridgePlugin {
  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: false, reason: 'web-platform' };
  }

  async hasPermissions(_options: RequestPermissionsOptions): Promise<HasPermissionsResult> {
    return { granted: false };
  }

  async requestPermissions(options: RequestPermissionsOptions): Promise<RequestPermissionsResult> {
    return { granted: [], denied: options.permissions };
  }

  async syncSince(_options?: SyncSinceOptions): Promise<SyncSinceResult> {
    return { samples: [], cursorISO: new Date().toISOString() };
  }

  async enableBackgroundDelivery(): Promise<void> {
    // no-op on web
  }

  async disableBackgroundDelivery(): Promise<void> {
    // no-op on web
  }
}
