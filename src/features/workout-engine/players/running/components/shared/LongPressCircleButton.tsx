'use client';

/**
 * LongPressCircleButton — generic circular long-press button.
 * ------------------------------------------------------------
 * Generalised version of `PlannedRun/LongPressPauseButton.tsx` so the
 * same conic-progress + vibration + scale-active interaction can be
 * reused across destructive/protective actions (Pause, Stop, …) without
 * copy-pasting the SVG math.
 *
 * Visual recipe (preserved from the PlannedRun original):
 *   • Outer SVG ring shows the hold-progress as a stroked circle.
 *   • Inner solid disc carries the icon at 75% of the outer diameter.
 *   • On confirm: vibrate + invoke `onConfirm`; the parent decides
 *     what to do (pause / finish / clear).
 *
 * Why a separate component vs. extending the original:
 *   The PlannedRun button hard-codes orange + Pause icon + 64 px size.
 *   Refactoring it in place would risk altering the structured-workout
 *   pause behaviour mid-flight; the original stays untouched and this
 *   generic version is what FreeRunActive's new control cluster uses.
 */

import React, { useRef, useCallback, useState } from 'react';

interface LongPressCircleButtonProps {
  icon: React.ReactNode;
  /** Solid background colour for the inner disc. */
  color: string;
  /** Stroke colour for the active progress ring. Defaults to `color`. */
  ringColor?: string;
  /** Background colour for the unfilled ring (light tint of `color`). */
  ringBackground?: string;
  /** How long the user must hold (seconds) before `onConfirm` fires. */
  holdDuration?: number;
  /** Outer diameter in px (the inner disc is sized to ~75% of this). */
  size?: number;
  /** Stroke width of the progress ring in px. */
  strokeWidth?: number;
  /** Fired once the hold reaches `holdDuration`. */
  onConfirm: () => void;
  ariaLabel?: string;
}

const DEFAULT_SIZE = 64;
const DEFAULT_STROKE = 4;
const DEFAULT_HOLD = 1.5;

export default function LongPressCircleButton({
  icon,
  color,
  ringColor,
  ringBackground,
  holdDuration = DEFAULT_HOLD,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE,
  onConfirm,
  ariaLabel,
}: LongPressCircleButtonProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const confirmedRef = useRef(false);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const innerSize = Math.round(size * 0.75);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    confirmedRef.current = false;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (!startRef.current || confirmedRef.current) return;
    const elapsed = (Date.now() - startRef.current) / 1000;
    const p = Math.min(elapsed / holdDuration, 1);
    setProgress(p);

    if (p >= 1) {
      confirmedRef.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60]);
      }
      onConfirm();
      // Settle the visual back to 0 so a follow-up press starts clean.
      // We don't call cancel() here because the parent may unmount the
      // button (e.g. status flips to 'paused' → FreeRunPaused renders).
      setProgress(0);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdDuration, onConfirm]);

  const handleDown = useCallback(() => {
    cancel();
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [cancel, tick]);

  const dashOffset = circumference * (1 - progress);
  // Premium "iOS / Apple Watch" fill recipe:
  //   • The active progress stroke fills with a near-opaque white so it
  //     reads cleanly on top of ANY button colour (orange Pause, red
  //     Stop, emerald Resume, cyan Lap…). Previously the stroke matched
  //     the button colour, which on darker palettes (orange/red) produced
  //     the muddy "blue/dark noise" look the team flagged.
  //   • The unfilled track is a soft 22% white tint. Together they read
  //     as a clean monochromatic ring regardless of palette — same
  //     language used in iOS confirmation rings.
  // Callers can still override either via `ringColor` / `ringBackground`
  // when a specific brand colour is required.
  const effectiveRingColor = ringColor ?? 'rgba(255,255,255,0.92)';
  const effectiveRingBg = ringBackground ?? 'rgba(255,255,255,0.22)';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={handleDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      className="relative flex items-center justify-center active:scale-95 transition-transform"
      style={{ width: size, height: size, minWidth: 44, minHeight: 44 }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={effectiveRingBg}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={effectiveRingColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: progress > 0 ? 'none' : 'stroke-dashoffset 0.15s' }}
        />
      </svg>

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
