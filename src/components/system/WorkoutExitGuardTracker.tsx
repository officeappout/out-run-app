'use client';

/**
 * WorkoutExitGuardTracker — mirrors two booleans into `@capacitor/preferences`
 * so `ViewController.swift`'s `decidePolicyFor` (native, synchronous, no JS
 * bridge available at decision time) can drive the silent-block-vs-legacy-
 * confirm decision for the iOS edge-swipe-back gesture. See
 * `src/lib/native/workoutExitGuard.ts` for the full mechanism writeup.
 *
 * Renders nothing. Mounted once from `NativeBootstrap` (root layout) so the
 * flags are wired from the earliest possible moment, independent of route.
 *
 * Android does NOT need this: `src/lib/native/init.ts`'s `backButton`
 * handler runs in plain JS and reads `useSessionStore.getState()` +
 * `WORKOUT_EXIT_HARD_BLOCK_ENABLED` directly — no native mirror required.
 */

import { useEffect } from 'react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { WORKOUT_EXIT_HARD_BLOCK_ENABLED } from '@/config/feature-flags';
import {
  writeNativeFlag,
  EXIT_HARD_BLOCK_PREF_KEY,
  AEROBIC_SESSION_ACTIVE_PREF_KEY,
} from '@/lib/native/workoutExitGuard';

export default function WorkoutExitGuardTracker() {
  const status = useSessionStore((s) => s.status);
  const mode = useSessionStore((s) => s.mode);

  // The hard-block flag is a compile-time constant, but the native side can
  // only read it via the Preferences mirror — write it once on mount so a
  // fresh cold start has it before any gesture can fire.
  useEffect(() => {
    writeNativeFlag(EXIT_HARD_BLOCK_PREF_KEY, WORKOUT_EXIT_HARD_BLOCK_ENABLED);
  }, []);

  // Re-mirror on every status/mode transition that could change whether an
  // aerobic (running/walking/hybrid) session is currently active or paused.
  useEffect(() => {
    const isAerobicSessionActive =
      (status === 'active' || status === 'paused')
      && (mode === 'running' || mode === 'walking' || mode === 'hybrid');
    writeNativeFlag(AEROBIC_SESSION_ACTIVE_PREF_KEY, isAerobicSessionActive);
  }, [status, mode]);

  return null;
}
