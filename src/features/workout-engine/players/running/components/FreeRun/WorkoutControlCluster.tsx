'use client';

/**
 * WorkoutControlCluster — 2-button state machine for FreeRunActive.
 * --------------------------------------------------------------------------
 * Replaces the previous Lap / Pause / Stop trio with a tighter cluster that
 * mirrors the in-flight workout state. The cluster only ever shows TWO
 * buttons; what those two buttons are depends on the session status:
 *
 *   ┌────────── RUNNING (status === 'active') ─────────────┐
 *   │ [ Lap (cyan, tap) ]      [ Pause (orange, tap) ]     │
 *   │   56 px                    64 px                     │
 *   │   single tap               single tap                │
 *   │                                                       │
 *   │  No standalone Stop button. Stop is only reachable    │
 *   │  by first pausing — that gate IS the safety guard     │
 *   │  against accidental finish.                           │
 *   └───────────────────────────────────────────────────────┘
 *
 *   ┌────────── PAUSED (status === 'paused') ──────────────┐
 *   │ [ Stop (red, hold 700ms) ]   [ Resume (orange, tap) ] │
 *   │   56 px                       64 px                   │
 *   │   long-press 0.7 s            single tap              │
 *   │                                                       │
 *   │  The Stop button replaces Lap on the LEFT only after  │
 *   │  the user has paused. The 700 ms hold is a deliberate │
 *   │  guard so a stray tap can't terminate the workout.    │
 *   │                                                       │
 *   │  AdaptiveMetricsWrapper additionally paints itself    │
 *   │  with an orange border + orange numbers in this       │
 *   │  state so the user sees the paused mode immediately.  │
 *   └───────────────────────────────────────────────────────┘
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
 *   ~88 px above the cluster for ~1.8 s on every successful lap. Only
 *   surfaces in the running state — paused has no Lap button.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, RotateCcw } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import LongPressCircleButton from '../shared/LongPressCircleButton';

const LAP_TOAST_MS = 1800;

// Light-theme palette consistent with SessionControlBar / PlannedRun.
const LAP_COLOR = '#00ADEF';   // out-cyan
const PAUSE_COLOR = '#FF8C00'; // structured-pause / resume orange
const STOP_COLOR = '#EF4444';  // destructive red

// Long-press threshold for the destructive Stop confirmation. 700 ms is
// short enough to feel responsive but long enough that a stray tap on a
// jostling phone never terminates the workout.
const STOP_HOLD_SECONDS = 0.7;

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

  const handlePause = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
    pauseSession();
  }, [pauseSession]);

  const handleResume = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
    resumeSession();
  }, [resumeSession]);

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
          collide with the buttons. Only relevant in the running state;
          gated below by `!isPaused` so a stale toast can't survive into
          the paused chrome. */}
      {lapToast && !isPaused && (
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
        `dir="ltr"` so the visual order is constant regardless of the
        parent's RTL container — long-press feedback and conic rings
        shouldn't flip on language. The bottom offset respects both the
        card's measured clearance AND the safe-area inset on notched
        devices.
      */}
      <div
        className="absolute left-0 right-0 z-40 flex items-center justify-center gap-5 pointer-events-auto px-6"
        dir="ltr"
        style={{
          bottom:
            'calc(env(safe-area-inset-bottom, 0px) + var(--session-bar-clearance, 88px))',
        }}
      >
        {isPaused ? (
          <>
            {/* Stop — long-press 700 ms with the destructive red palette.
                Calls `finishWorkout` directly; the long-press IS the
                confirmation. Replaces the Lap button on the LEFT so the
                geometry of the cluster stays balanced (small / big) and
                the orange Resume button keeps its anchor on the right. */}
            <LongPressCircleButton
              icon={<Square size={20} fill="currentColor" />}
              color={STOP_COLOR}
              onConfirm={handleStopConfirm}
              holdDuration={STOP_HOLD_SECONDS}
              size={56}
              ariaLabel="סיים אימון"
            />

            {/* Resume — single tap. Orange disc + white play icon
                matches the paused-state metrics card so the user sees
                a single coherent orange surface to "press play". No
                long-press: resuming is non-destructive. */}
            <CircleTapButton
              icon={<Play size={26} fill="currentColor" className="text-white" />}
              color={PAUSE_COLOR}
              onClick={handleResume}
              size={64}
              ariaLabel="המשך אימון"
            />
          </>
        ) : (
          <>
            {/* Lap — single tap. Cyan inner disc, faint outer ring acts
                as a visual peer to any future long-press conic ring on
                the right (so the pair reads as one cluster). */}
            <CircleTapButton
              icon={<RotateCcw size={20} strokeWidth={2.5} className="text-white" />}
              color={LAP_COLOR}
              onClick={handleLap}
              size={56}
              ariaLabel="הקפה חדשה"
            />

            {/* Pause — single tap. Pausing is a fully reversible state
                transition (Resume restores everything), so no long-press
                guard is needed here. The destructive guard lives on the
                Stop button that surfaces AFTER the user has paused. */}
            <CircleTapButton
              icon={<Pause size={26} fill="currentColor" className="text-white" />}
              color={PAUSE_COLOR}
              onClick={handlePause}
              size={64}
              ariaLabel="השהה אימון"
            />
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline helper: circular tap button.
// Visual recipe mirrors the inner disc + faint outer peer-ring of
// `LongPressCircleButton` so the two button kinds slot into the cluster
// without any visual seam — only the destructive Stop carries an active
// progress ring (filled by the LongPressCircleButton itself).
// Kept local because it's tightly coupled to the cluster's visual language
// and has no other consumer.
// ─────────────────────────────────────────────────────────────────────────────
interface CircleTapButtonProps {
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  size?: number;
  ariaLabel?: string;
}

function CircleTapButton({
  icon,
  color,
  onClick,
  size = 56,
  ariaLabel,
}: CircleTapButtonProps) {
  const innerSize = Math.round(size * 0.75);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative flex items-center justify-center active:scale-90 transition-transform"
      style={{ width: size, height: size, minWidth: 44, minHeight: 44 }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          // 25 %-opacity peer ring matches the unfilled track on
          // LongPressCircleButton (rgba white 22 % over the colour disc).
          // Mixing in the button colour keeps the ring branded per-button.
          border: `2px solid ${color}40`,
        }}
      />
      <div
        className="rounded-full flex items-center justify-center text-white shadow-lg"
        style={{
          width: innerSize,
          height: innerSize,
          backgroundColor: color,
        }}
      >
        {icon}
      </div>
    </button>
  );
}
