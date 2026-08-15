'use client';

/**
 * WorkoutExitGuardTracker — mirrors three booleans into `@capacitor/preferences`
 * so `ViewController.swift`'s `decidePolicyFor` (native, synchronous, no JS
 * bridge available at decision time) can drive the recovery-video-exit-vs-
 * silent-block-vs-legacy-confirm decision for the iOS edge-swipe-back
 * gesture. See `src/lib/native/workoutExitGuard.ts` for the full mechanism
 * writeup.
 *
 * The aerobic-active flag is mirrored from a plain `useSessionStore.subscribe`
 * callback rather than a `useEffect([status, mode])` — `subscribe`'s listener
 * runs SYNCHRONOUSLY inside the store's own `set()` call (see zustand v5
 * `vanilla.d.ts`: `subscribe: (listener: (state, prevState) => void) => () => void`),
 * so the mirror write is triggered at the exact moment `startSession()` /
 * `pauseSession()` / `resumeSession()` mutate the store — with no dependency
 * on React scheduling a render, committing it, and flushing a passive effect
 * afterwards. That render-commit hop was a real propagation-window gap: it
 * fires on every session start/pause/resume, and the window lands right after
 * the user taps "start" — the single most likely moment for an immediate
 * swipe-back. See `.claude/knowledge/` for the review finding this closes.
 *
 * Because the store's `set()` also fires on every `tick()` (once/sec) and
 * every `updateDistance()`/`updateCalories()` (GPS updates), the subscribe
 * callback must NOT recompute-and-write unconditionally on every store
 * change — that would be a write-storm against the Preferences bridge for
 * the entire duration of every run. `lastWrittenAerobicActive` (module-level,
 * outside the callback) remembers the last value actually written, and the
 * callback only calls `writeNativeFlag` when the derived boolean changes.
 *
 * The same `handleStoreChange` callback also mirrors `isRecoveryVideoSession`
 * (RECOVERY_VIDEO_EXIT_BUTTON_ENABLED, `src/config/feature-flags.ts`) into
 * `RECOVERY_VIDEO_EXIT_ACTIVE_PREF_KEY`, gated by its OWN independent
 * `lastWrittenRecoveryVideoActive` guard — a change in one flag must not
 * trigger a redundant write of the other.
 *
 * Renders nothing. Mounted once from `NativeBootstrap` (root layout) so the
 * flags are wired from the earliest possible moment, independent of route.
 *
 * Android does NOT need this: `src/lib/native/init.ts`'s `backButton`
 * handler runs in plain JS and reads `useSessionStore.getState()` +
 * `WORKOUT_EXIT_HARD_BLOCK_ENABLED` directly — no native mirror required.
 */

import { useEffect } from 'react';
import { useSessionStore, type SessionMode, type SessionStatus } from '@/features/workout-engine/core/store/useSessionStore';
import { WORKOUT_EXIT_HARD_BLOCK_ENABLED } from '@/config/feature-flags';
import {
  writeNativeFlag,
  EXIT_HARD_BLOCK_PREF_KEY,
  AEROBIC_SESSION_ACTIVE_PREF_KEY,
  RECOVERY_VIDEO_EXIT_ACTIVE_PREF_KEY,
} from '@/lib/native/workoutExitGuard';

function deriveIsAerobicSessionActive(status: SessionStatus, mode: SessionMode): boolean {
  return (
    (status === 'active' || status === 'paused')
    && (mode === 'running' || mode === 'walking' || mode === 'hybrid')
  );
}

// Remembers the last value actually written to the Preferences mirror, so
// the subscribe callback below can skip redundant writes on every tick.
// Module-level (not component state): the callback is a plain closure
// registered once, not a React render path.
let lastWrittenAerobicActive: boolean | null = null;
// Same purpose as lastWrittenAerobicActive above, but for the independent
// isRecoveryVideoSession mirror — kept as a SEPARATE guard so a change in
// one flag never suppresses or triggers a write of the other.
let lastWrittenRecoveryVideoActive: boolean | null = null;

export default function WorkoutExitGuardTracker() {
  // The hard-block flag is a compile-time constant, but the native side can
  // only read it via the Preferences mirror — write it once on mount so a
  // fresh cold start has it before any gesture can fire.
  useEffect(() => {
    writeNativeFlag(EXIT_HARD_BLOCK_PREF_KEY, WORKOUT_EXIT_HARD_BLOCK_ENABLED);
  }, []);

  // Mirror the aerobic-active + recovery-video-session flags synchronously
  // off the store itself (see module doc above) instead of off a React
  // effect dependency array. The `useEffect([])` here only performs
  // one-time SETUP of the subscription — the real-time work happens inside
  // `handleStoreChange`, which zustand invokes synchronously from within
  // `set()`, every time, for as long as the subscription is live.
  useEffect(() => {
    const handleStoreChange = (state: {
      status: SessionStatus;
      mode: SessionMode;
      isRecoveryVideoSession: boolean;
    }) => {
      const isAerobicSessionActive = deriveIsAerobicSessionActive(state.status, state.mode);
      if (isAerobicSessionActive !== lastWrittenAerobicActive) {
        lastWrittenAerobicActive = isAerobicSessionActive;
        writeNativeFlag(AEROBIC_SESSION_ACTIVE_PREF_KEY, isAerobicSessionActive);
      }

      // RECOVERY_VIDEO_EXIT_BUTTON_ENABLED — independent guard (see module
      // doc above), so this never piggybacks on / suppresses the aerobic
      // write above.
      if (state.isRecoveryVideoSession !== lastWrittenRecoveryVideoActive) {
        lastWrittenRecoveryVideoActive = state.isRecoveryVideoSession;
        writeNativeFlag(RECOVERY_VIDEO_EXIT_ACTIVE_PREF_KEY, state.isRecoveryVideoSession);
      }
    };

    // Prime the mirror with the current state immediately — matches what the
    // original effect-based version would have written on initial mount,
    // before any store mutation has happened yet.
    handleStoreChange(useSessionStore.getState());

    const unsubscribe = useSessionStore.subscribe(handleStoreChange);
    return unsubscribe;
  }, []);

  return null;
}
