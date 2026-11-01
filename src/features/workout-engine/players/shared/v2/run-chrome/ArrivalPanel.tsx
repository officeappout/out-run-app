'use client';

/**
 * ArrivalPanel — the drawer content on arrival at a navigation destination (enable_unified_player_v1,
 * canvas 9ב): "you arrived", then start a workout here (a park: saves the walk and opens the park)
 * or finish and save. Without a park at the destination only the finish button shows.
 */

import React, { useState } from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';

export interface ArrivalPanelProps {
  place: string;
  km: string;
  time: string;
  /** Set when the destination is a park. */
  onStartHere?: () => Promise<void> | void;
  onFinish: () => Promise<void> | void;
}

export default function ArrivalPanel({ place, km, time, onStartHere, onFinish }: ArrivalPanelProps) {
  const t = useT(together);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void> | void) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col items-center gap-3 pb-1 text-center">
      <div className="text-[20px] font-black text-v2-ink">{t('chrome.arrive.title')}</div>
      <div className="text-[13px] font-extrabold text-slate-500">{t('chrome.arrive.sub', { place, km, time })}</div>
      {onStartHere && (
        <button
          type="button"
          disabled={busy}
          onClick={run(onStartHere)}
          className="mt-1 h-[52px] w-full rounded-full text-[16px] font-extrabold text-white active:scale-[0.98] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#00baf7,#0284c7)', boxShadow: '0 12px 24px -12px rgba(2,132,199,0.8)' }}
        >
          {t('chrome.arrive.startHere')}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={run(onFinish)}
        className={onStartHere
          ? 'h-12 w-full rounded-full bg-white text-[14.5px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.98] disabled:opacity-60'
          : 'mt-1 h-[52px] w-full rounded-full text-[16px] font-extrabold text-white active:scale-[0.98] disabled:opacity-60'}
        style={onStartHere ? undefined : { background: 'linear-gradient(135deg,#00baf7,#0284c7)' }}
      >
        {t('chrome.arrive.finish')}
      </button>
    </div>
  );
}
