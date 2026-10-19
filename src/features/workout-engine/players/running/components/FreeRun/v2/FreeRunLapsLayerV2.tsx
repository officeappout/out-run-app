'use client';

/**
 * FreeRunLapsLayerV2 — the session list BEHIND the v2 free-run player (the
 * laps), in the shared SessionListLayer frame. One row per lap, the live lap
 * marked "עכשיו". Owner rule: a lap under 400 m shows no pace.
 */

import React from 'react';
import { SessionListLayer } from '../../../../shared/v2';
import { avgPaceSec, lapRows } from '../../../lib/continuous-run';
import { fmtClock, fmtPace } from '../../../lib/planned-rep-results';
import { useFreeRunLive } from './useFreeRunLive';

export default function FreeRunLapsLayerV2({ onClose }: { onClose: () => void }) {
  const { laps, totals } = useFreeRunLive();
  const rows = lapRows(laps);
  const avg = avgPaceSec(totals.durationSec, totals.distanceKm);

  return (
    <SessionListLayer
      subtitle="ריצה חופשית · הקפות"
      onClose={onClose}
      safeTop={false}
      totals={`${fmtClock(totals.durationSec)} · ${totals.distanceKm.toFixed(2)} ק״מ${avg > 0 ? ` · ${fmtPace(avg)} ממוצע` : ''}`}
    >
      {rows.length === 0 ? (
        <div className="mt-4 rounded-[20px] bg-white px-4 py-6 text-center shadow-v2-ring">
          <p className="text-[15px] font-black text-v2-ink">אין הקפות עדיין</p>
          <p className="mt-1 text-[13px] font-bold text-v2-muted">כל הקפה תופיע כאן עם הזמן והקצב שלה</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[20px] bg-white p-1 shadow-v2-ring">
          <div className="flex items-center gap-3 px-3 pb-1 pt-2 text-[12px] font-extrabold text-v2-muted">
            <span className="w-8 shrink-0" />
            <span className="flex-1 whitespace-nowrap">הקפה</span>
            <span className="w-14 shrink-0 whitespace-nowrap text-left">ק״מ</span>
            <span className="w-14 shrink-0 whitespace-nowrap text-left">זמן</span>
            <span className="w-14 shrink-0 whitespace-nowrap text-left">קצב</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className={`flex min-h-[52px] items-center gap-3 px-3 py-2 ${r.active ? 'rounded-[14px] bg-v2-tint' : ''}`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-black tabular-nums ${
                  r.active ? 'bg-white text-v2-deep ring-2 ring-inset ring-v2-accent' : 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline'
                }`}
                aria-hidden
              >
                {r.n}
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14.5px] font-black text-v2-ink">
                {r.active ? `הקפה ${r.n} · עכשיו` : `הקפה ${r.n}`}
              </span>
              <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.distanceText}</span>
              <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.timeText}</span>
              <span dir="ltr" className="w-14 shrink-0 text-left text-[15px] font-black tabular-nums text-v2-ink">{r.paceText ?? '–'}</span>
            </div>
          ))}
        </div>
      )}
    </SessionListLayer>
  );
}
