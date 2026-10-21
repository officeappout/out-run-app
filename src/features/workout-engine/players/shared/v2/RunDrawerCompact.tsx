'use client';

/**
 * RunDrawerCompact — the low snap of the run / walk metrics drawer
 * (enable_run_player_drawer_v1): the mini-player's black bar, floating —
 * time · distance · pace, pause / resume, and the hold-to-stop square (a stray
 * tap never ends a workout). Tap the bar = back to the full card.
 * Layout only.
 */

import React from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useHoldToConfirm } from './useHoldToConfirm';
import { useUiGender } from '@/hooks/useUiGender';
import { GENDERED_COPY, pickGendered } from '@/lib/i18n/gender-copy';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface RunDrawerCompactProps {
  /** "24:07". */
  time: string;
  /** "3.42". */
  distanceKm: string;
  /** "5:41" / "11.2". */
  rate: string;
  /** "קצב" / "מהירות". */
  rateLabel: string;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const HEIGHT = 64;

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center">
      <span dir="ltr" className="whitespace-nowrap text-[19px] font-black leading-none tabular-nums">{value}</span>
      <span className="mt-1 whitespace-nowrap text-[11px] font-bold leading-none text-white/55">{label}</span>
    </span>
  );
}

function HoldStop({ onStop, ariaLabel }: { onStop: () => void; ariaLabel: string }) {
  const { progress, handlers } = useHoldToConfirm(onStop);
  const box = 44;
  const r = 19;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      className="relative grid shrink-0 select-none place-items-center active:scale-[0.97] transition-transform duration-150 ease-v2"
      style={{ width: box, height: box, touchAction: 'none', WebkitTouchCallout: 'none' }}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {progress > 0 && (
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="#e5484d" strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        )}
      </svg>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
        <Square size={14} fill="#e5484d" color="#e5484d" strokeWidth={2.2} aria-hidden />
      </span>
    </button>
  );
}

export default function RunDrawerCompact({
  time,
  distanceKm,
  rate,
  rateLabel,
  isPaused,
  onPause,
  onResume,
  onStop,
}: RunDrawerCompactProps) {
  const t = useT(player);
  const gender = useUiGender();
  return (
    <div
      dir="rtl"
      // data-coach (inert): the route-player tip's target — pause + hold-to-stop live here
      // when the drawer is compact (enable_entry_whatnow_v1).
      data-coach="route-player-controls"
      className="flex items-center gap-2 rounded-[22px] bg-v2-ink px-3 text-white shadow-v2-float"
      style={{ height: HEIGHT, fontFamily: 'var(--font-simpler)' }}
    >
      <button
        type="button"
        aria-label={pickGendered(gender, isPaused ? GENDERED_COPY.resumeWorkout : GENDERED_COPY.pauseWorkout)}
        onClick={(e) => {
          e.stopPropagation();
          if (isPaused) onResume();
          else onPause();
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-v2-ink active:scale-[0.97] transition-transform duration-150 ease-v2"
      >
        {isPaused ? <Play size={19} fill="currentColor" strokeWidth={0} aria-hidden /> : <Pause size={19} fill="currentColor" strokeWidth={0} aria-hidden />}
      </button>
      <Metric value={time} label={t('run.drawer.label.time')} />
      <Metric value={distanceKm} label={t('run.drawer.label.distance')} />
      <Metric value={rate} label={rateLabel} />
      <HoldStop onStop={onStop} ariaLabel={t('run.drawer.stopAria')} />
    </div>
  );
}
