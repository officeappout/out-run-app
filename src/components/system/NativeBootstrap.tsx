'use client';

/**
 * NativeBootstrap — root-level client component mounted in the root layout.
 *
 * Responsibilities:
 *   1. Calls `initNativeShell()` exactly once after the app shell hydrates,
 *      wiring Capacitor lifecycle events (app state, back button, HealthBridge,
 *      push auth bridge).
 *   2. Renders `PushForegroundToast` — the in-app banner overlay that surfaces
 *      push notifications received while the app is in the foreground (the OS
 *      suppresses the system tray banner in that case).
 *
 * SSR-safe: the import is behind the 'use client' boundary and `initNativeShell`
 * is a no-op outside the Capacitor native shell.
 */

import { useEffect } from 'react';

import { initNativeShell } from '@/lib/native/init';
import PushForegroundToast from './PushForegroundToast';

export default function NativeBootstrap() {
  useEffect(() => {
    void initNativeShell();
  }, []);

  return <PushForegroundToast />;
}
