'use client';

import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DashboardPayload } from '@/lib/costs/dashboard';
import { CONNECTOR_BY_ID } from '@/lib/costs/connector-meta';
import { CADENCE_HE, fmtIls, fmtMoney } from './costs-client';
import MonthBars from './MonthBars';

export default function VendorTable({ data }: { data: DashboardPayload }) {
  const [open, setOpen] = useState<string | null>(null);
  const { summary, trend, isCurrentMonth } = data;
  const max = Math.max(1, ...Object.values(trend.byRow).flat());
  const totalMax = Math.max(1, ...trend.totals);

  const detail = (key: string): React.ReactNode => {
    const row = summary.rows.find((r) => r.key === key)!;
    if (row.source === 'manual') {
      const item = data.items.find((i) => `i:${i.id}` === key);
      if (!item) return null;
      return (
        <p className="text-xs text-slate-600">
          {CADENCE_HE[item.cadence]} · {fmtMoney(item.amount, item.currency)}
          {item.vendor ? ` · ${item.vendor}` : ''}
          {row.covered ? ' · כבר נספר דרך המחבר של הספק, לא נוסף שוב לסכום' : ''}
        </p>
      );
    }
    const snap = data.connectors.find((c) => c.id === row.source)?.snapshot;
    if (!snap) return null;
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-slate-500">
          {CONNECTOR_BY_ID[row.source].label} · עודכן {new Date(snap.fetchedAtMs).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
        {snap.breakdown.length > 0 && (
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-700">
            {snap.breakdown.map((l) => (
              <li key={l.label} className="flex justify-between gap-3 tabular-nums">
                <span className="truncate" dir="auto">{l.label}</span>
                <span>{fmtMoney(l.amount, snap.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (summary.rows.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-500">
        אין עדיין עלויות לחודש הזה. לחצו על &quot;רענן עכשיו&quot; כדי למשוך מהמחברים, או הוסיפו מנוי ידני למטה.
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">עלויות לפי ספק</caption>
        <thead>
          <tr className="text-xs text-slate-500 border-b border-slate-100">
            <th scope="col" className="text-start font-medium px-4 py-2">ספק</th>
            <th scope="col" className="text-end font-medium px-3 py-2">{isCurrentMonth ? 'עד היום' : 'בפועל'}</th>
            {isCurrentMonth && <th scope="col" className="text-end font-medium px-3 py-2">צפי</th>}
            <th scope="col" className="text-start font-medium px-3 py-2 hidden sm:table-cell">6 חודשים</th>
            <th scope="col" className="w-8" />
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <Fragment key={r.key}>
              <tr className={`border-b border-slate-50 ${r.covered ? 'text-slate-400' : 'text-slate-800'}`}>
                <td className="px-4 py-2">
                  <span className="font-bold">{r.label}</span>
                  <span className="ms-2 text-[11px] text-slate-500">{r.kind === 'usage' ? 'לפי שימוש' : 'קבוע'}</span>
                  {r.covered && <span className="ms-2 text-[11px] rounded bg-slate-100 px-1.5 py-0.5">נספר במחבר</span>}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">{fmtIls(r.ils)}</td>
                {isCurrentMonth && <td className="px-3 py-2 text-end tabular-nums text-slate-600">{fmtIls(r.forecastIls)}</td>}
                <td className="px-3 py-2 hidden sm:table-cell">
                  {!r.covered && <MonthBars months={trend.months} values={trend.byRow[r.key] ?? []} max={max} />}
                </td>
                <td className="px-2">
                  <button
                    type="button"
                    onClick={() => setOpen(open === r.key ? null : r.key)}
                    aria-expanded={open === r.key}
                    aria-label={`פירוט ${r.label}`}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    <ChevronDown size={16} className={`transition-transform ${open === r.key ? 'rotate-180' : ''}`} />
                  </button>
                </td>
              </tr>
              {open === r.key && (
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  <td colSpan={isCurrentMonth ? 5 : 4} className="px-4 py-2">{detail(r.key)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-black text-slate-900">
            <td className="px-4 py-2.5">סה״כ</td>
            <td className="px-3 py-2.5 text-end tabular-nums">{fmtIls(summary.totalIls)}</td>
            {isCurrentMonth && <td className="px-3 py-2.5 text-end tabular-nums">{fmtIls(summary.forecastIls)}</td>}
            <td className="px-3 py-2.5 hidden sm:table-cell">
              <MonthBars months={trend.months} values={trend.totals} max={totalMax} />
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
