'use client';

/**
 * Floating buttons above the drawer edge (board H-8): each on a different END.
 *   running: lap (blue, start end) · pause (orange, big, other end)
 *   paused:  stop (red, hold to end, start end) · resume (cyan, big, other end); lap hidden
 * Captions under every button. Logical placement (justify-between), so RTL/LTR flip together.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { hapticTap } from '@/lib/haptics';
import { useHoldToConfirm } from '../useHoldToConfirm';

export interface RunFloatingButtonsProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  /** Omitted = no lap button (walks, routes: board PlayerMetrics). */
  onLap?: () => void;
  onStop: () => void;
  /** Pilot AK3: one more control on the start end (settings), within thumb reach. */
  extra?: React.ReactNode;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/90 px-2.5 py-px text-center text-[11.5px] font-extrabold text-slate-700">{children}</span>;
}

function StopHold({ onStop, label }: { onStop: () => void; label: string }) {
  const { progress, handlers } = useHoldToConfirm(onStop);
  const box = 58;
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      aria-label={label}
      {...handlers}
      className="relative grid select-none place-items-center rounded-full bg-[#e5484d] active:scale-[0.97]"
      style={{ width: box, height: box, touchAction: 'none', WebkitTouchCallout: 'none', boxShadow: '0 12px 24px -10px rgba(229,72,77,0.8)' }}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {progress > 0 && <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />}
      </svg>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2.5" fill="#fff" /></svg>
    </button>
  );
}

export default function RunFloatingButtons({ isPaused, onPause, onResume, onLap, onStop, extra }: RunFloatingButtonsProps) {
  const t = useT(together);
  const startEnd = () => (
    isPaused ? (
      <span className="pointer-events-auto flex flex-col items-center gap-1">
        <StopHold onStop={onStop} label={t('chrome.btn.stopAria')} />
        <Caption>{t('chrome.btn.stop')}</Caption>
      </span>
    ) : !onLap ? (
      <span aria-hidden />
    ) : (
      <span className="pointer-events-auto flex flex-col items-center gap-1">
        <button
          type="button"
          aria-label={t('chrome.btn.lap')}
          onClick={onLap}
          className="grid h-[54px] w-[54px] place-items-center rounded-full bg-[#0284c7] active:scale-[0.97]"
          style={{ boxShadow: '0 12px 24px -10px rgba(2,132,199,0.8)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1" />
          </svg>
        </button>
        <Caption>{t('chrome.btn.lap')}</Caption>
      </span>
    )
  );
  return (
    <div className="pointer-events-none flex items-end justify-between px-6">
      {extra ? <span className="flex items-end gap-4">{extra}{startEnd()}</span> : startEnd()}
      <span className="pointer-events-auto flex flex-col items-center gap-1">
        {isPaused ? (
          <button
            type="button"
            aria-label={t('chrome.btn.resume')}
            onClick={() => { hapticTap('impact'); onResume(); }}
            className="grid h-[72px] w-[72px] place-items-center rounded-full active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg,#00baf7,#0cf2e3)', boxShadow: '0 16px 30px -12px rgba(0,186,247,0.8)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden><path d="M7 4l13 8-13 8z" fill="#04222b" /></svg>
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('chrome.btn.pause')}
            onClick={() => { hapticTap('impact'); onPause(); }}
            className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#f97316] active:scale-[0.97]"
            style={{ boxShadow: '0 16px 30px -12px rgba(249,115,22,0.8)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden><rect x="6" y="4" width="4" height="16" rx="1" fill="#fff" /><rect x="14" y="4" width="4" height="16" rx="1" fill="#fff" /></svg>
          </button>
        )}
        <Caption>{isPaused ? t('chrome.btn.resume') : t('chrome.btn.pause')}</Caption>
      </span>
    </div>
  );
}
