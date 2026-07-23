'use client';

/**
 * FillingButton
 * Auto-filling button component for reps-based exercises
 * Features:
 * - Auto-fill animation from left to right
 * - Auto-complete when time expires
 * - Blue 'V' button design
 * - Smooth animations
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check } from 'lucide-react';
import { TIMER_AUTO_ADVANCE_ENABLED } from '@/config/feature-flags';

interface FillingButtonProps {
  autoCompleteTime: number; // Time in seconds before auto-complete
  onClick: () => void;
  label?: string; // Button label (default: "סיימתי")
  isPaused?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function FillingButton({
  autoCompleteTime,
  onClick,
  label = 'סיימתי',
  isPaused = false,
  disabled = false,
  className = '',
}: FillingButtonProps) {
  const safeDuration = (!autoCompleteTime || autoCompleteTime <= 0) ? 10 : autoCompleteTime;
  const MIN_MOUNT_MS = 1500;

  const [fillProgress, setFillProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);
  const hasFiredRef = useRef(false);

  const updateFillProgress = useCallback(() => {
    if (isPaused || disabled || isComplete || hasFiredRef.current || !startTimeRef.current) {
      return;
    }

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / safeDuration, 1);

    setFillProgress(progress);

    if (progress >= 1) {
      const msSinceMount = Date.now() - mountTimeRef.current;
      if (msSinceMount < MIN_MOUNT_MS) {
        animationFrameRef.current = requestAnimationFrame(updateFillProgress);
        return;
      }
      hasFiredRef.current = true;
      setIsComplete(true);
      onClick();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateFillProgress);
  }, [isPaused, disabled, isComplete, safeDuration, onClick]);

  useEffect(() => {
    if (isPaused || disabled || isComplete) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // C1 (product decision): when auto-advance is OFF (default), the fill bar is
    // removed entirely — the loop never starts, so fillProgress stays 0 and no bar
    // renders. FillingButton becomes a plain tap-only "סיימתי" (only handleClick
    // completes). Applies to EVERY FillingButton usage — strength-player warmup +
    // core reps AND legacy ExerciseDetailsSheet — one source, no fork. The flag is
    // a dormant reversible toggle: flip it true to restore the auto-fill behaviour.
    if (!TIMER_AUTO_ADVANCE_ENABLED) return;

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    animationFrameRef.current = requestAnimationFrame(updateFillProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPaused, disabled, isComplete, updateFillProgress]);

  useEffect(() => {
    setFillProgress(0);
    setIsComplete(false);
    startTimeRef.current = null;
    mountTimeRef.current = Date.now();
    hasFiredRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [safeDuration]);

  const handleClick = useCallback(() => {
    if (disabled || isComplete || hasFiredRef.current) return;
    hasFiredRef.current = true;
    setIsComplete(true);
    onClick();
  }, [disabled, isComplete, onClick]);

  // Calculate fill width percentage
  const fillWidth = `${fillProgress * 100}%`;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isComplete}
      className={`
        relative w-full h-14
        bg-white dark:bg-slate-900
        border border-slate-200/80 dark:border-slate-700/60
        rounded-full
        flex items-center justify-center gap-3
        font-bold text-gray-900 dark:text-white
        shadow-sm
        active:scale-[0.98]
        transition-transform duration-150
        overflow-hidden
        ${disabled || isComplete ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Fill Background Animation */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#00AEEF] to-[#00C9F2] transition-all duration-100 ease-linear"
        style={{
          width: fillWidth,
          transition: isPaused ? 'none' : 'width 0.1s linear',
        }}
      />

      {/* Content (Text + Icon) */}
      <div className="relative z-10 flex items-center gap-3">
        <span className="text-lg text-gray-900 dark:text-white">
          {label}
        </span>
        <Check
          size={22}
          className="text-slate-600 dark:text-slate-300"
        />
      </div>

      {/* Border overlay to maintain border visibility */}
      <div className="absolute inset-0 rounded-full border border-slate-200/80 dark:border-slate-700/60 pointer-events-none" />
    </button>
  );
}
