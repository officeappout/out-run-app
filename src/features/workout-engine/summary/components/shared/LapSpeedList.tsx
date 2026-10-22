'use client';

/**
 * LapSpeedList — a ride's laps on the summary's segments tab (enable_home_v2
 * cycling): distance · time · average km/h per lap. The run summary's pace
 * chart / list would show min/km, which means nothing on a bike. Laps under
 * 400 m show no speed (same owner rule as pace).
 */

import React from 'react';
import { lapRows, type LapInput } from '@/features/workout-engine/players/running/lib/continuous-run';
import { useT } from '@/hooks/useT';
import { summary } from '@/messages/ns/summary';

export default function LapSpeedList({ laps }: { laps: readonly LapInput[] }) {
  const t = useT(summary);
  const rows = lapRows(laps, 'speed');
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[20px] bg-white p-1 shadow-v2-ring" dir="rtl">
      <div className="flex items-center gap-3 px-3 pb-1 pt-2 text-[12px] font-extrabold text-v2-muted">
        <span className="flex-1 whitespace-nowrap">{t('laps.header.lap')}</span>
        <span className="w-14 shrink-0 whitespace-nowrap text-left">{t('laps.header.km')}</span>
        <span className="w-14 shrink-0 whitespace-nowrap text-left">{t('laps.header.time')}</span>
        <span className="w-14 shrink-0 whitespace-nowrap text-left">{t('laps.header.speed')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex min-h-[48px] items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">{t('laps.row', { n: String(r.n) })}</span>
          <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.distanceText}</span>
          <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.timeText}</span>
          <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.paceText ?? '–'}</span>
        </div>
      ))}
    </div>
  );
}
