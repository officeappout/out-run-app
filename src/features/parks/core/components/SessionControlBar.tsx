'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';

const LONG_PRESS_MS = 800;
const LAP_TOAST_MS = 1800;

export default function SessionControlBar() {
  const { status, pauseSession, resumeSession } = useSessionStore();
  const isPaused = status === 'paused';
  const isActive = status === 'active' || status === 'paused';

  const [stopProgress, setStopProgress] = useState(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRaf = useRef<number | null>(null);
  const stopStart = useRef(0);

  const [lapToast, setLapToast] = useState<string | null>(null);
  const lapToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - stopStart.current;
    const pct = Math.min(elapsed / LONG_PRESS_MS, 1);
    setStopProgress(pct);
    if (pct < 1) {
      stopRaf.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const handleStopDown = useCallback(() => {
    stopStart.current = Date.now();
    setStopProgress(0);
    stopRaf.current = requestAnimationFrame(animateProgress);
    stopTimer.current = setTimeout(async () => {
      setStopProgress(0);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([40, 60, 40]);
      // finishWorkout handles: stop GPS, compute summary, set showSummary, endSession
      const { finishWorkout } = useRunningPlayer.getState();
      await finishWorkout();
    }, LONG_PRESS_MS);
  }, [animateProgress]);

  const handleStopUp = useCallback(() => {
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    if (stopRaf.current) { cancelAnimationFrame(stopRaf.current); stopRaf.current = null; }
    setStopProgress(0);
  }, []);

  const handleLap = useCallback(() => {
    const state = useRunningPlayer.getState();
    state.triggerLap();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);

    const lapCount = (state.laps?.length ?? 0) + 1;
    setLapToast(`Lap ${lapCount}`);
    if (lapToastTimer.current) clearTimeout(lapToastTimer.current);
    lapToastTimer.current = setTimeout(() => setLapToast(null), LAP_TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (lapToastTimer.current) clearTimeout(lapToastTimer.current);
    };
  }, []);

  if (!isActive) return null;

  return (
    <>
      {/* Lap toast */}
      {lapToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-40 px-5 py-2 rounded-2xl font-black text-sm text-white pointer-events-none animate-bounce"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 380px)',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            boxShadow: '0 6px 24px rgba(16,185,129,0.5)',
          }}
        >
          {lapToast}
        </div>
      )}

      <div
        className="absolute left-0 right-0 z-40 flex items-center justify-center gap-5 pointer-events-auto px-6"
        dir="ltr"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 320px)',
        }}
      >
        {/* Lap — Emerald ring */}
        <button
          onClick={handleLap}
          className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1.5px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
          }}
        >
          <RotateCcw size={22} className="text-emerald-300" />
        </button>

        {/* Play / Pause — center, largest */}
        <button
          onClick={isPaused ? resumeSession : pauseSession}
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center active:scale-90 transition-all"
          style={{
            background: isPaused
              ? 'linear-gradient(135deg, #10B981, #34D399)'
              : 'linear-gradient(135deg, #FF8C00, #FFA726)',
            boxShadow: isPaused
              ? '0 8px 28px rgba(16, 185, 129, 0.5)'
              : '0 8px 28px rgba(255, 140, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          {isPaused ? (
            <Play size={32} fill="white" className="text-white ms-1" />
          ) : (
            <Pause size={32} fill="white" className="text-white" />
          )}
        </button>

        {/* Stop — long press with conic progress */}
        <div className="relative">
          <button
            onMouseDown={handleStopDown}
            onMouseUp={handleStopUp}
            onMouseLeave={handleStopUp}
            onTouchStart={handleStopDown}
            onTouchEnd={handleStopUp}
            onTouchCancel={handleStopUp}
            className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform relative overflow-hidden"
            style={{
              background: stopProgress > 0
                ? `conic-gradient(#EF4444 ${stopProgress * 360}deg, rgba(239,68,68,0.2) ${stopProgress * 360}deg)`
                : 'rgba(239, 68, 68, 0.2)',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              boxShadow: stopProgress > 0 ? '0 0 20px rgba(239,68,68,0.4)' : '0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            <Square size={18} fill="white" className="text-white" />
          </button>
          {stopProgress > 0 && (
            <span
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap"
              style={{ color: '#EF4444' }}
            >
              החזק לעצירה
            </span>
          )}
        </div>
      </div>
    </>
  );
}
