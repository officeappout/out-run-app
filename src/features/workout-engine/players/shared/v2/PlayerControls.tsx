'use client';

/**
 * PlayerControls — the v2 continuous player's one control row (boards
 * R2-prop-easy, U-B1…U-C1): lap · a black pause / resume disc in the centre
 * · stop as a red square that ends ONLY on a long press (a ring fills while
 * holding). No skip disc: skipping lives on the "הבא" strip and in the
 * session list behind the player.
 */

import React from 'react';
import { Pause, Play, Square, Timer } from 'lucide-react';
import { hapticTap } from '@/lib/haptics';
import { useHoldToConfirm } from './useHoldToConfirm';
import { useUiGender } from '@/hooks/useUiGender';
import { GENDERED_COPY, pickGendered } from '@/lib/i18n/gender-copy';

export interface PlayerControlsProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onStop: () => void;
  /** Seconds to hold the stop square. Default 1.2. */
  holdSeconds?: number;
}

const SIDE = 56;
const CENTRE = 72;

function HoldToStop({ onStop, holdSeconds }: { onStop: () => void; holdSeconds: number }) {
  const { progress, handlers } = useHoldToConfirm(onStop, holdSeconds);
  const box = SIDE + 10;
  const r = SIDE / 2 + 3;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      aria-label="סיום אימון · לחיצה ארוכה"
      {...handlers}
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
      <span className="grid place-items-center rounded-full bg-white shadow-v2-ring" style={{ width: SIDE, height: SIDE }}>
        <Square size={19} fill="#e5484d" color="#e5484d" strokeWidth={2.2} aria-hidden />
      </span>
    </button>
  );
}

export default function PlayerControls({ isPaused, onPause, onResume, onLap, onStop, holdSeconds = 1.2 }: PlayerControlsProps) {
  const gender = useUiGender();
  return (
    <div dir="rtl">
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          aria-label="הקפה"
          onClick={onLap}
          className="grid shrink-0 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
          style={{ width: SIDE, height: SIDE }}
        >
          <Timer size={22} strokeWidth={2.3} className="text-v2-deep" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={pickGendered(gender, isPaused ? GENDERED_COPY.resumeWorkout : GENDERED_COPY.pauseWorkout)}
          onClick={() => { hapticTap('impact'); (isPaused ? onResume : onPause)(); }}
          className="grid shrink-0 place-items-center rounded-full bg-v2-ink text-white active:scale-[0.97] transition-transform duration-150 ease-v2"
          style={{ width: CENTRE, height: CENTRE, boxShadow: '0 16px 30px -14px rgba(9,30,50,0.6)' }}
        >
          {isPaused ? <Play size={28} fill="currentColor" strokeWidth={0} aria-hidden /> : <Pause size={28} fill="currentColor" strokeWidth={0} aria-hidden />}
        </button>
        <HoldToStop onStop={onStop} holdSeconds={holdSeconds} />
      </div>
      <p className="mt-1 whitespace-nowrap text-center text-[11.5px] font-bold text-v2-muted">לחיצה ארוכה על הריבוע מסיימת</p>
    </div>
  );
}
