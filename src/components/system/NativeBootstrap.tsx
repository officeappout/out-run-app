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
 *   3. Renders `ForceUpdateGate` — the blocking "update to continue" screen
 *      for native builds below `app_config/app_version` (see features/app-version).
 *   4. Renders `WorkoutExitGuardTracker` — mirrors the workout-exit-hard-block
 *      flag + live aerobic-session-active state into `@capacitor/preferences`
 *      so `ViewController.swift` can read them natively/synchronously (see
 *      `src/lib/native/workoutExitGuard.ts`).
 *
 * SSR-safe: the import is behind the 'use client' boundary and `initNativeShell`
 * is a no-op outside the Capacitor native shell.
 */

import { useEffect } from 'react';

import { initNativeShell } from '@/lib/native/init';
import PushForegroundToast from './PushForegroundToast';
import WorkoutExitGuardTracker from './WorkoutExitGuardTracker';
import KeyboardInsetBootstrap from './KeyboardInsetBootstrap';
import ForceUpdateGate from '@/features/app-version/components/ForceUpdateGate';

export default function NativeBootstrap() {
  useEffect(() => {
    void initNativeShell();
  }, []);

  return (
    <>
      <PushForegroundToast />
      <WorkoutExitGuardTracker />
      {/* Web + native: keyboard inset (--kb-inset) for sheets/composers. */}
      <KeyboardInsetBootstrap />
      {/* Native only: blocks builds below app_config/app_version minBuild. */}
      <ForceUpdateGate />
    </>
  );
}
