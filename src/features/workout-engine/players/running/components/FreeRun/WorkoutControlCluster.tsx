'use client';

/**
 * WorkoutControlCluster — circular Lap / Pause / Stop trio for FreeRunActive.
 * --------------------------------------------------------------------------
 * Replaces the global `<SessionControlBar />` for free-run sessions and
 * matches the visual language of `PlannedRunActive`'s in-map FAB row:
 * three circular buttons anchored at the bottom of the map area, with
 * the central Pause/Stop guarded by a 1.5 s long-press conic ring.
 *
 *   [ Lap (cyan) ]   [ Pause (orange) ]   [ Stop (red) ]
 *      56 px              64 px              56 px
 *      tap            long-press 1.5s    long-press 1.5s
 *
 * Bottom-offset contract:
 *   The cluster reads `--session-bar-clearance` (set live by
 *   `useDraggableMetrics` whenever the metrics card resizes) so the row
 *   always floats above the metrics card AND the bottom nav, regardless
 *   of pill / expanded state. Same variable, same fallback as
 *   `SessionControlBar` so the visual position stays consistent if the
 *   user toggles into a flow that still uses the global bar.
 *
 * Lap toast:
 *   "Lap N" bubble (same emerald gradient as SessionControlBar) appears
 *   ~88 px above the cluster for ~1.8 s on every successful lap.
 *
 * Why a separate component:
 *   FreeRunActive owns its full chrome now and should NOT rely on a
 *   MapShell-mounted singleton for its primary controls — that would
 *   make the cluster's position depend on whether the global bar is
 *   present, and force MapShell to know about FreeRun's control surface.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, RotateCcw } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import LongPressCircleButton from '../shared/LongPressCircleButton';

const LAP_TOAST_MS = 1800;

// Light-theme palette consistent with SessionControlBar / PlannedRun.
const LAP_COLOR = '#00ADEF';   // out-cyan
const PAUSE_COLOR = '#FF8C00'; // structured-pause orange
const STOP_COLOR = '#EF4444';  // destructive red
const RESUME_COLOR = '#10B981';// emerald (mirrors paused-state SessionControlBar)

export default function WorkoutControlCluster() {
  const status = useSessionStore((s) => s.status);
  const pauseSession = useSessionStore((s) => s.pauseSession);
  const resumeSession = useSessionStore((s) => s.resumeSession);

  const isPaused = status === 'paused';

  const [lapToast, setLapToast] = useState<string | null>(null);
  const lapToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLap = useCallback(() => {
    const state = useRunningPlayer.getState();
    state.triggerLap();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }

    const lapCount = (state.laps?.length ?? 0) + 1;
    setLapToast(`Lap ${lapCount}`);
    if (lapToastTimer.current) clearTimeout(lapToastTimer.current);
    lapToastTimer.current = setTimeout(() => setLapToast(null), LAP_TOAST_MS);
  }, []);

  const handlePauseConfirm = useCallback(() => {
    if (isPaused) {
      resumeSession();
    } else {
      pauseSession();
    }
  }, [isPaused, pauseSession, resumeSession]);

  const handleStopConfirm = useCallback(async () => {
    const { finishWorkout } = useRunningPlayer.getState();
    await finishWorkout();
  }, []);

  useEffect(() => {
    return () => {
      if (lapToastTimer.current) clearTimeout(lapToastTimer.current);
    };
  }, []);

  if (status !== 'active' && status !== 'paused') return null;

  return (
    <>
      {/* Lap toast — sits ~88 px above the cluster row so it doesn't
          collide with the buttons. Same offset recipe as SessionControlBar
          so toggling between free-run and other flows keeps the toast
          in the same spot. */}
      {lapToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-40 px-5 py-2 rounded-2xl font-black text-sm text-white pointer-events-none animate-bounce"
          style={{
            bottom:
              'calc(env(safe-area-inset-bottom, 0px) + var(--session-bar-clearance, 88px) + 88px)',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            boxShadow: '0 6px 24px rgba(16,185,129,0.5)',
          }}
        >
          {lapToast}
        </div>
      )}

      {/*
        Cluster row.
        ────────────
        `dir="ltr"` so the visual order (Lap | Pause | Stop) is constant
        regardless of the parent's RTL container — long-press feedback
        and conic rings shouldn't flip on language. The bottom offset
        respects both the card's measured clearance AND the safe-area
        inset on notched devices.
      */}
      <div
        className="absolute left-0 right-0 z-40 flex items-center justify-center gap-5 pointer-events-auto px-6"
        dir="ltr"
        style={{
          bottom:
            'calc(env(safe-area-inset-bottom, 0px) + var(--session-bar-clearance, 88px))',
        }}
      >
        {/* Lap — single tap, same circular minimal recipe as Pause but
            without the long-press ring. Cyan inner disc, faint outer
            ring acts as a visual peer to the conic rings on the
            long-press buttons (so the trio reads as one cluster). */}
        <button
          type="button"
          aria-label="הקפה חדשה"
          onClick={handleLap}
          className="relative flex items-center justify-center active:scale-90 transition-transform"
          style={{ width: 56, height: 56, minWidth: 44, minHeight: 44 }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${LAP_COLOR}40`, // 25% opacity peer-ring
            }}
          />
          <div
            className="rounded-full flex items-center justify-center text-white shadow-lg"
            style={{
              width: 42,
              height: 42,
              backgroundColor: LAP_COLOR,
            }}
          >
            <RotateCcw size={20} strokeWidth={2.5} />
          </div>
        </button>

        {/* Pause / Resume — long-press 1.5 s. Colour & icon swap on
            paused state so the same physical button reads as the
            primary "continue" CTA after a pause without forcing the
            user to look elsewhere. */}
        <LongPressCircleButton
          icon={
            isPaused ? (
              <Play size={26} fill="currentColor" />
            ) : (
              <Pause size={26} fill="currentColor" />
            )
          }
          color={isPaused ? RESUME_COLOR : PAUSE_COLOR}
          onConfirm={handlePauseConfirm}
          holdDuration={1.5}
          size={64}
          ariaLabel={isPaused ? 'המשך אימון' : 'השהה אימון'}
        />

        {/* Stop — long-press 1.5 s with the destructive red palette. Calls
            `finishWorkout` directly (bypassing the pause overlay) — the
            long-press IS the confirmation, no extra modal. */}
        <LongPressCircleButton
          icon={<Square size={20} fill="currentColor" />}
          color={STOP_COLOR}
          onConfirm={handleStopConfirm}
          holdDuration={1.5}
          size={56}
          ariaLabel="סיים אימון"
        />
      </div>
    </>
  );
}
