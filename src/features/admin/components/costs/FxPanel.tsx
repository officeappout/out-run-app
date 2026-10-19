'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MonthFx } from '@/lib/costs/cost-types';
import { costsFetch, monthLabel, readError } from './costs-client';

const SOURCE_HE: Record<MonthFx['source'], string> = {
  manual: 'הוזן ידנית',
  frankfurter: 'שער יציג ECB (מתעדכן ברענון היומי)',
  default: 'ברירת מחדל — עוד לא נמשך שער',
};

export default function FxPanel({ month, fx, onSaved }: { month: string; fx: MonthFx; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [usd, setUsd] = useState(String(fx.USD));
  const [eur, setEur] = useState(String(fx.EUR));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await costsFetch('/api/admin/costs/fx', { method: 'PUT', body: JSON.stringify({ month, ...body }) });
      if (!res.ok) throw new Error(await readError(res));
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-20 text-sm border border-slate-200 rounded-lg px-2 py-1 tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-900">שערי מטבע · {monthLabel(month)}</h2>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="ms-auto text-xs font-bold text-sky-700 hover:underline underline-offset-2">
            עריכה
          </button>
        )}
      </div>
      {!editing ? (
        <>
          <p className="text-sm text-slate-800 tabular-nums mt-2" dir="ltr">$1 = ₪{fx.USD.toFixed(3)} · €1 = ₪{fx.EUR.toFixed(3)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{SOURCE_HE[fx.source]}</p>
        </>
      ) : (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            send({ USD: Number(usd), EUR: Number(eur) });
          }}
        >
          <div className="flex gap-3 text-sm items-center">
            <label className="flex items-center gap-1.5">₪ ל-$1 <input className={input} inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} dir="ltr" /></label>
            <label className="flex items-center gap-1.5">₪ ל-€1 <input className={input} inputMode="decimal" value={eur} onChange={(e) => setEur(e.target.value)} dir="ltr" /></label>
          </div>
          <div className="flex gap-2 items-center">
            <button type="submit" disabled={busy} className="px-3 py-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : 'שמור לחודש הזה'}
            </button>
            {fx.source === 'manual' && (
              <button type="button" disabled={busy} onClick={() => send({ clear: true })} className="text-xs text-slate-600 hover:underline underline-offset-2">
                חזרה לשער האוטומטי
              </button>
            )}
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 ms-auto">ביטול</button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </section>
  );
}
