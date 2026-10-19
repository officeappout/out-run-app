'use client';

/**
 * The v2 live player's centre control (board F-1c): a big black pause disc.
 * A tap pauses; holding it ends the workout — the ONLY way to end from the
 * live screen (no stray-tap finish). A ring fills while holding.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause } from 'lucide-react';

interface Props {
  onTap: () => void;
  onHoldComplete: () => void;
  /** Seconds to hold. Default 1.2. */
  holdSeconds?: number;
  size?: number;
}

/** Releases shorter than this count as a tap (pause). */
const TAP_MAX_MS = 450;

export default function HoldToEndPauseButton({ onTap, onHoldComplete, holdSeconds = 1.2, size = 72 }: Props) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const p = Math.min(1, (Date.now() - startRef.current) / (holdSeconds * 1000));
    setProgress(p);
    if (p >= 1) {
      firedRef.current = true;
      stop();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([60]);
      onHoldComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdSeconds, onHoldComplete, stop]);

  const down = useCallback(() => {
    firedRef.current = false;
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const up = useCallback(() => {
    const started = startRef.current;
    stop();
    if (firedRef.current || started === null) return;
    if (Date.now() - started <= TAP_MAX_MS) onTap();
  }, [onTap, stop]);

  const r = size / 2 + 4;
  const c = 2 * Math.PI * r;
  const box = size + 12;
  return (
    <button
      type="button"
      aria-label="השהה · לחיצה ארוכה מסיימת"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      className="relative grid shrink-0 select-none place-items-center active:scale-[0.97] transition-transform duration-150 ease-v2"
      style={{ width: box, height: box, touchAction: 'none', WebkitTouchCallout: 'none' }}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {progress > 0 && (
          <circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            fill="none"
            stroke="#e5484d"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
          />
        )}
      </svg>
      <span
        className="grid place-items-center rounded-full bg-v2-ink text-white"
        style={{ width: size, height: size, boxShadow: '0 16px 30px -14px rgba(9,30,50,0.6)' }}
      >
        <Pause size={28} fill="currentColor" strokeWidth={0} aria-hidden />
      </span>
    </button>
  );
}
