'use client';

/**
 * SegmentTable — one segment table for laps and reps (board PlayerSegmentTable): an optional target
 * pill + "5 of 6 in range" chip, a header row (number · name · km · time · pace), then thin rows.
 * The pace is coloured by the target (green in range, orange slow / fast) with a small word under
 * it; the current row sits on a light cyan tint. Presentational: rows come from the caller.
 */

import React from 'react';

export type SegmentPaceTone = 'in' | 'off' | 'none';

export interface SegmentTableRow {
  key: string;
  /** Number in the badge (rep / lap). */
  n: number | string;
  name: string;
  km: string;
  time: string;
  /** Pace text, or null for legs under 400 m (no pace, owner rule). */
  pace: string | null;
  paceTone?: SegmentPaceTone;
  /** "בטווח" / "איטי ב־4 שנ׳" under the pace. */
  paceNote?: string;
  current?: boolean;
  muted?: boolean;
  onClick?: () => void;
}

export interface SegmentTableProps {
  columns: { name: string; km: string; time: string; pace: string };
  rows: readonly SegmentTableRow[];
  /** Target band text ("4:50-5:10 /km"); label before it ("יעד"). */
  target?: { label: string; value: string } | null;
  /** "5 מתוך 6 בטווח". */
  summary?: string | null;
  className?: string;
}

const TONE: Record<SegmentPaceTone, string> = { in: '#16a34a', off: '#b45309', none: '#0e1419' };
const GRID = 'grid grid-cols-[24px_minmax(0,1fr)_56px_50px_56px] items-center gap-2 px-3';

export default function SegmentTable({ columns, rows, target, summary, className = '' }: SegmentTableProps) {
  return (
    <div className={`overflow-hidden rounded-[18px] bg-white shadow-v2-ring ${className}`}>
      {(target || summary) && (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          {target && (
            <>
              <span className="text-[12px] font-extrabold text-v2-muted">{target.label}</span>
              <span dir="ltr" className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-black text-emerald-700">{target.value}</span>
            </>
          )}
          {summary && <span className="ms-auto whitespace-nowrap text-[12px] font-black text-green-600">{summary}</span>}
        </div>
      )}
      <div className={`${GRID} border-b border-v2-hairline pb-1.5 pt-2 text-[11.5px] font-extrabold text-v2-muted`}>
        <span aria-hidden />
        <span>{columns.name}</span>
        <span className="text-end">{columns.km}</span>
        <span className="text-end">{columns.time}</span>
        <span className="text-end">{columns.pace}</span>
      </div>
      {rows.map((r) => {
        const tone = TONE[r.paceTone ?? 'none'];
        const body = (
          <>
            <span className="grid h-[21px] w-[21px] place-items-center rounded-full bg-slate-100 text-[10.5px] font-black text-slate-600">{r.n}</span>
            <span className="truncate whitespace-nowrap text-[14px] font-extrabold text-v2-ink">{r.name}</span>
            <span className="text-end text-[14px] font-extrabold tabular-nums text-v2-ink">{r.km}</span>
            <span className="text-end text-[14px] font-extrabold tabular-nums text-v2-ink">{r.time}</span>
            <span className="flex flex-col items-end leading-[1.1]">
              <span dir="ltr" className="text-[14.5px] font-black tabular-nums" style={{ color: tone }}>{r.pace ?? '–'}</span>
              {r.paceNote && <span className="text-[10.5px] font-extrabold" style={{ color: tone }}>{r.paceNote}</span>}
            </span>
          </>
        );
        const cls = `${GRID} w-full border-b border-slate-100 py-2.5 text-start last:border-b-0 ${r.current ? 'bg-sky-50' : ''} ${r.muted ? 'opacity-60' : ''}`;
        return r.onClick ? (
          <button key={r.key} type="button" onClick={r.onClick} className={`${cls} active:bg-v2-surface`} aria-current={r.current ? 'step' : undefined}>
            {body}
          </button>
        ) : (
          <div key={r.key} className={cls} aria-current={r.current ? 'step' : undefined}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
