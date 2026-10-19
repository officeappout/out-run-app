'use client';

/**
 * RepPaceTable — the v2 summary's "קצב בכל חזרה" (board F-1g): a pace-per-rep
 * bar chart against the target band, a "5 מתוך 6 חזרות בטווח" chip, and one
 * row per rep (number · time · target · in-range / slow by N s · avg pace).
 * Presentational only — rows come from the summary mapping.
 */

import React from 'react';
import { Target } from 'lucide-react';

export interface RepPaceRow {
  key: string;
  /** Number in the circle. */
  n: number;
  /** "1:55" (the rep's time). */
  title: string;
  /** "יעד 4:45–4:55". */
  sub?: string;
  /** "בטווח" / "איטי ב-3 שנ׳". */
  status?: string;
  tone: 'in' | 'off' | 'none';
  /** Big value on the left — avg pace, or the time for legs without pace. */
  value: string;
  /** Pace (sec/km) for the chart; null/undefined = no bar. */
  paceSec?: number | null;
  /** Bar label ("4:48"). */
  paceLabel?: string;
}

export interface RepPaceTableProps {
  rows: readonly RepPaceRow[];
  /** Common target band for the chart (sec/km), when every rep shares one. */
  band?: { min: number; max: number } | null;
  /** "5 מתוך 6 חזרות בטווח". */
  summaryLabel?: string | null;
  /** Bar colour of in-range reps (the block colour). */
  barColor?: string;
  title?: string;
}

const TONE = {
  in: { fg: '#10b981', text: '#047857' },
  off: { fg: '#f59e0b', text: '#b45309' },
  none: { fg: '#94a3b8', text: '#64748b' },
} as const;

function Chart({ rows, band, barColor }: { rows: readonly RepPaceRow[]; band?: { min: number; max: number } | null; barColor: string }) {
  const paces = rows.map((r) => r.paceSec).filter((p): p is number => !!p && p > 0);
  if (paces.length < 2) return null;
  const lo = Math.min(...paces, band?.min ?? Infinity) - 6;
  const hi = Math.max(...paces, band?.max ?? -Infinity) + 6;
  // Faster (lower sec) = taller bar; 18 %…100 % of the plot.
  const h = (p: number) => 18 + ((hi - p) / (hi - lo)) * 82;
  const H = 64;
  return (
    <div className="relative mt-3" style={{ height: H + 34 }}>
      {band && band.min > 0 && (
        <div
          className="absolute inset-x-0 border-y border-dashed border-[#10b981] bg-[#10b981]/10"
          style={{ top: 16 + H - (h(band.min) / 100) * H, height: Math.max(2, ((h(band.min) - h(band.max)) / 100) * H) }}
          aria-hidden
        />
      )}
      <div className="absolute inset-x-0 top-0 flex items-end justify-around gap-2" style={{ height: H + 16 }}>
        {rows.map((r) => {
          const p = r.paceSec && r.paceSec > 0 ? r.paceSec : null;
          return (
            <div key={r.key} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: H + 16 }}>
              {p && <span className="mb-0.5 text-[11px] font-extrabold tabular-nums text-v2-ink-2">{r.paceLabel}</span>}
              <div
                className="w-full max-w-[28px] rounded-[7px]"
                style={{ height: p ? (h(p) / 100) * H : 4, background: p ? (r.tone === 'off' ? TONE.off.fg : barColor) : '#dfe7ed' }}
              />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-around gap-2">
        {rows.map((r) => (
          <span key={r.key} className="flex-1 text-center text-[11px] font-extrabold tabular-nums text-v2-muted">
            {r.n}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RepPaceTable({ rows, band, summaryLabel, barColor = '#e5484d', title = 'קצב בכל חזרה' }: RepPaceTableProps) {
  if (rows.length === 0) return null;
  return (
    <div dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</span>
        {summaryLabel && (
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#ecfdf5] px-3 text-[12.5px] font-extrabold text-[#047857]">
            <Target size={14} strokeWidth={2.4} aria-hidden />
            {summaryLabel}
          </span>
        )}
      </div>
      <Chart rows={rows} band={band} barColor={barColor} />
      <div className="mt-2 divide-y divide-v2-hairline">
        {rows.map((r) => {
          const t = TONE[r.tone];
          return (
            <div key={r.key} className="flex min-h-[50px] items-center gap-3 py-2">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-black tabular-nums text-white"
                style={{ background: t.fg }}
                aria-hidden
              >
                {r.n}
              </span>
              <span className="min-w-0 flex-1">
                <span dir="ltr" className="block truncate text-right text-[15px] font-black tabular-nums text-v2-ink">{r.title}</span>
                {r.sub && <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{r.sub}</span>}
              </span>
              {r.status && (
                <span className="shrink-0 whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: t.text }}>
                  {r.status}
                </span>
              )}
              <span dir="ltr" className="w-14 shrink-0 text-left text-[17px] font-black tabular-nums text-v2-ink">
                {r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
