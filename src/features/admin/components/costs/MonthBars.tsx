'use client';

import { fmtIls, monthLabel } from './costs-client';

/**
 * Six-month bars for one row — real values with month names on hover / for screen readers.
 * The selected month is the last bar (darker).
 */
export default function MonthBars({ months, values, max }: { months: string[]; values: number[]; max: number }) {
  const top = Math.max(max, 1);
  const label = months.map((m, i) => `${monthLabel(m, true)} ${fmtIls(values[i] ?? 0)}`).join(', ');
  return (
    <div className="flex items-end gap-[3px] h-7 w-[84px]" role="img" aria-label={label}>
      {months.map((m, i) => {
        const v = values[i] ?? 0;
        const h = v > 0 ? Math.max(2, Math.round((v / top) * 28)) : 1;
        return (
          <span
            key={m}
            title={`${monthLabel(m)}: ${fmtIls(v)}`}
            className={`flex-1 rounded-sm ${i === months.length - 1 ? 'bg-slate-700' : 'bg-slate-300'}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}
