'use client';

import type { DashboardPayload } from '@/lib/costs/dashboard';
import { dayLabel, fmtMoney } from './costs-client';

export default function RenewalsPanel({ renewals }: { renewals: DashboardPayload['renewals'] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-sm font-bold text-slate-900">חידושים ב-30 הימים הקרובים</h2>
      {renewals.length === 0 ? (
        <p className="text-xs text-slate-500 mt-2">אין חידושים קרובים.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {renewals.map((r) => (
            <li key={r.itemId} className="flex items-baseline gap-2 py-1.5 text-sm">
              <span className="font-bold text-slate-800 truncate">{r.name}</span>
              <span className="ms-auto tabular-nums text-slate-700">{fmtMoney(r.amount, r.currency)}</span>
              <span className={`text-xs tabular-nums w-16 text-end ${r.inDays <= 7 ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
                {r.inDays === 0 ? 'היום' : `${dayLabel(r.date)} · ${r.inDays} ימ׳`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
