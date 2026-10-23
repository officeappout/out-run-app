'use client';

/**
 * Me-vs-them in the drawer (board H-6): two photo circles with VS, rows with
 * my value | label | their value (distance, pace now, avg pace, time,
 * elevation), the gap line with its trend, and a close button.
 */

import React from 'react';
import { X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '@/features/workout-engine/together/hooks/useTogetherLocale';
import { localizeParams } from '@/features/workout-engine/together/core/localize';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { formatPace } from '@/features/workout-engine/together/core/rail-logic';
import { betterSide, clockText, vsGap, type VsSide } from './run-chrome-logic';

export interface RunVsPanelProps {
  me: VsSide & { name: string; photoURL?: string };
  them: VsSide & { name: string; photoURL?: string; color?: string };
  prevGapMeters?: number | null;
  /** 'speed' shows km/h rows instead of pace. */
  metric?: 'pace' | 'speed';
  onClose: () => void;
}

function Face({ name, photoURL, color }: { name: string; photoURL?: string; color: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full bg-[#1a1a2e] text-[15px] font-extrabold" style={{ color, boxShadow: `0 0 0 3px ${color}` }}>
        {photoURL ? <img src={photoURL} alt="" className="h-full w-full object-cover" /> : (name.charAt(0) || '·')}
      </span>
      <span className="max-w-[90px] truncate text-[12.5px] font-extrabold text-slate-800">{name}</span>
    </span>
  );
}

export default function RunVsPanel({ me, them, prevGapMeters = null, metric = 'pace', onClose }: RunVsPanelProps) {
  const t = useT(together);
  const { locale } = useTogetherLocale();
  const gap = vsGap(me, them, prevGapMeters);
  const km = (v: number) => formatNumber(v, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rate = (secPerKm: number) => (metric === 'speed' ? (secPerKm > 0 ? km(3600 / secPerKm) : '--') : formatPace(secPerKm) || '--:--');

  const rows: Array<{ key: string; label: string; a: string; b: string; better: 'me' | 'them' | null }> = [
    { key: 'distance', label: t('chrome.vs.distance'), a: km(me.distanceKm), b: km(them.distanceKm), better: betterSide('distance', me, them) },
    { key: 'pace', label: t(metric === 'speed' ? 'chrome.label.speedNow' : 'chrome.vs.paceNow'), a: rate(me.paceSecPerKm), b: rate(them.paceSecPerKm), better: betterSide('pace', me, them) },
    { key: 'avg', label: t(metric === 'speed' ? 'chrome.label.avgSpeed' : 'chrome.vs.avgPace'), a: rate(me.avgPaceSecPerKm), b: rate(them.avgPaceSecPerKm), better: betterSide('avgPace', me, them) },
    { key: 'time', label: t('chrome.vs.time'), a: clockText(me.elapsedSec), b: clockText(them.elapsedSec), better: null },
    { key: 'elev', label: t('chrome.vs.elev'), a: t('chrome.vs.elevValue', localizeParams({ m: Math.round(me.elevGainM) }, locale)), b: t('chrome.vs.elevValue', localizeParams({ m: Math.round(them.elevGainM) }, locale)), better: betterSide('elev', me, them) },
  ];
  const meters = Math.abs(gap.meters);
  const gapText =
    gap.leader === 'even' ? t('chrome.vs.gapEven')
      : gap.leader === 'me' ? t('chrome.vs.gapMe', localizeParams({ m: meters }, locale))
        : t('chrome.vs.gapThem', { name: them.name, ...localizeParams({ m: meters }, locale) });
  const trendText = gap.trend === 'closing' ? t('chrome.vs.closing') : gap.trend === 'growing' ? t('chrome.vs.growing') : '';

  return (
    <div>
      <button type="button" onClick={onClose} aria-label={t('chrome.vs.close')} className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600">
        <X size={16} aria-hidden />
      </button>
      <div className="flex items-center justify-center gap-6">
        <Face name={t('chrome.vs.me')} photoURL={me.photoURL} color="#0284c7" />
        <span className="text-[15px] font-black text-slate-400">{t('chrome.vs.vs')}</span>
        <Face name={them.name} photoURL={them.photoURL} color={them.color ?? '#a855f7'} />
      </div>
      <div className="mt-3 flex flex-col">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center border-t border-slate-100 py-1.5 first:border-t-0">
            <span dir="ltr" className={`flex-1 text-center text-[20px] font-black tabular-nums ${r.better === 'me' ? 'text-emerald-600' : 'text-slate-900'}`}>{r.a}</span>
            <span className="w-[92px] text-center text-[11.5px] font-extrabold text-slate-500">{r.label}</span>
            <span dir="ltr" className={`flex-1 text-center text-[20px] font-black tabular-nums ${r.better === 'them' ? 'text-emerald-600' : 'text-slate-900'}`}>{r.b}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[13px] font-extrabold text-sky-800" role="status">
        {gapText}{trendText ? ` · ${trendText}` : ''}
      </p>
    </div>
  );
}
