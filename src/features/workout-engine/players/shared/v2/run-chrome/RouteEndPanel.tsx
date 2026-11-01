'use client';

/**
 * RouteEndPanel — the drawer content when the route is done (enable_unified_player_v1, canvas 9ב):
 * "you finished the route", then finish and save / one more loop / go on free.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';

export interface RouteEndPanelProps {
  name: string;
  km: string;
  time: string;
  onFinish: () => void;
  onAgain: () => void;
  onFree: () => void;
}

export default function RouteEndPanel({ name, km, time, onFinish, onAgain, onFree }: RouteEndPanelProps) {
  const t = useT(together);
  return (
    <div className="flex flex-col items-center gap-3 pb-1 text-center">
      <div className="text-[20px] font-black text-v2-ink">{t('chrome.routeEnd.title')}</div>
      <div className="text-[13px] font-extrabold text-slate-500">{t('chrome.routeEnd.sub', { name, km, time })}</div>
      <button
        type="button"
        onClick={onFinish}
        className="mt-1 h-[52px] w-full rounded-full text-[16px] font-extrabold text-white active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg,#00baf7,#0284c7)', boxShadow: '0 12px 24px -12px rgba(2,132,199,0.8)' }}
      >
        {t('chrome.routeEnd.finish')}
      </button>
      <div className="flex w-full gap-2">
        <button type="button" onClick={onAgain} className="h-12 flex-1 rounded-full bg-white text-[14.5px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.98]">
          {t('chrome.routeEnd.again')}
        </button>
        <button type="button" onClick={onFree} className="h-12 flex-1 rounded-full bg-white text-[14.5px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.98]">
          {t('chrome.routeEnd.free')}
        </button>
      </div>
    </div>
  );
}
