'use client';

import React, { useRef, useCallback, useState } from 'react';
import { Pause } from 'lucide-react';

interface LongPressPauseButtonProps {
  onConfirm: () => void;
  holdDuration?: number;
}

const SIZE = 64;
const STROKE_WIDTH = 4;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function LongPressPauseButton({
  onConfirm,
  holdDuration = 1.5,
}: LongPressPauseButtonProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const confirmedRef = useRef(false);

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
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdDuration, onConfirm]);

  const handleDown = useCallback(() => {
    cancel();
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [cancel, tick]);

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <button
      onPointerDown={handleDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      className="relative flex items-center justify-center active:scale-95 transition-transform"
      style={{ width: SIZE, height: SIZE, minWidth: 44, minHeight: 44 }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,140,0,0.25)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#FF8C00"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: progress > 0 ? 'none' : 'stroke-dashoffset 0.15s' }}
        />
      </svg>

      <div className="w-12 h-12 rounded-full bg-[#FF8C00] flex items-center justify-center text-white shadow-lg">
        <Pause size={24} fill="currentColor" />
      </div>
    </button>
  );
}
