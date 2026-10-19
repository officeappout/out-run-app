'use client';

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { DashboardPayload } from '@/lib/costs/dashboard';
import { fmtIls, monthLabel } from './costs-client';
import { toIls } from '@/lib/costs/fx';

/** One ruled strip of the month's numbers — not a row of stat cards. */
export default function SummaryStrip({ data }: { data: DashboardPayload }) {
  const { summary, isCurrentMonth, changePct, todayAiUsd, fx } = data;
  const up = changePct !== null && changePct > 0;
  const cells: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    {
      label: isCurrentMonth ? `${monthLabel(data.month)} · עד היום` : monthLabel(data.month),
      value: fmtIls(summary.totalIls),
      hint: isCurrentMonth ? `${data.elapsedDays} מתוך ${data.totalDays} ימים` : 'סגור',
    },
    {
      label: 'צפי לסוף החודש',
      value: isCurrentMonth ? fmtIls(summary.forecastIls) : '—',
      hint: isCurrentMonth ? 'שימוש: קו ישר מהקצב עד היום · קבועים: מלא' : undefined,
    },
    {
      label: 'מול החודש הקודם',
      value:
        changePct === null ? (
          '—'
        ) : (
          <span className={`inline-flex items-center gap-1 ${up ? 'text-amber-700' : 'text-emerald-700'}`}>
            {up ? <ArrowUpRight size={18} aria-hidden /> : <ArrowDownRight size={18} aria-hidden />}
            {Math.abs(changePct)}%
          </span>
        ),
      hint: `${fmtIls(data.previousTotalIls)} בחודש שעבר${isCurrentMonth ? ' · לפי הצפי' : ''}`,
    },
    {
      label: 'קלי AI היום',
      value: todayAiUsd === null ? '—' : `$${todayAiUsd.toFixed(2)}`,
      hint: todayAiUsd === null ? 'אין עדיין קריאות היום' : `≈ ${fmtIls(toIls(todayAiUsd, 'USD', fx))} · הערכה מהיומן`,
    },
  ];

  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-slate-100 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse">
      {cells.map((c) => (
        <div key={c.label} className="px-4 py-3 min-w-0">
          <dt className="text-xs text-slate-500">{c.label}</dt>
          <dd className="text-2xl font-black text-slate-900 tabular-nums mt-0.5">{c.value}</dd>
          {c.hint && <dd className="text-[11px] text-slate-500 mt-0.5 truncate" title={c.hint}>{c.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
