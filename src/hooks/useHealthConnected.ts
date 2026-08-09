'use client';

import { useEffect, useState } from 'react';
import { PREF_KEY_PERMISSIONS } from '@/lib/healthBridge/init';

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

/**
 * Ground-truth "is HealthKit / Health Connect actually granted" check —
 * reads PREF_KEY_PERMISSIONS directly from native Preferences, the SAME
 * source healthBridgeSyncNow()'s own gate checks (init.ts) and
 * StepsAnalyticsPage's permission gate already used.
 *
 * Deliberately does NOT use useSettingsStore.healthBridgeEnabled: that
 * field is never persisted (plain Zustand, no `persist` middleware) and
 * is only corrected by an async sign-in reconciliation effect
 * (native/init.ts's onAuthStateChanged handler) via `.patch()`, which
 * never sets `isLoaded` — so a component trusting it alone had no
 * reliable way to distinguish "not yet reconciled" from "genuinely not
 * connected," and could show a stale "connect to health" CTA even while
 * sync was running fine off the correctly-set native flag.
 *
 * Returns `null` while the initial native read is in flight — callers
 * should treat null as "don't know yet" (show a neutral/loading state),
 * not "not connected", to avoid flashing the wrong CTA before the real
 * value lands.
 */
export function useHealthConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(!isNativeApp() ? true : null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
        if (!cancelled) setConnected(value === '1');
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return connected;
}

export default useHealthConnected;
