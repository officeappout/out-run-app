'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { CostItem } from '@/lib/costs/cost-types';
import type { CostItemInput } from '@/lib/costs/item-schema';
import { CADENCE_HE, CATEGORY_HE, costsFetch, fmtMoney, readError } from './costs-client';
import { QUICK_ADDS } from './quick-add';
import ItemForm from './ItemForm';

type Mode = { kind: 'idle' } | { kind: 'add'; initial?: Partial<CostItemInput>; seq: number } | { kind: 'edit'; item: CostItem };

export default function ItemsPanel({ items, today, onChanged }: { items: CostItem[]; today: string; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const toggleActive = async (item: CostItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await costsFetch(`/api/admin/costs/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
      if (!res.ok) throw new Error(await readError(res));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const done = () => {
    setMode({ kind: 'idle' });
    onChanged();
  };
  const visible = items.filter((i) => showInactive || i.active);
  const inactiveCount = items.length - items.filter((i) => i.active).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-black text-slate-900 me-auto">מנויים וחיובים קבועים</h2>
        {inactiveCount > 0 && (
          <label className="text-xs text-slate-600 flex items-center gap-1.5">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            הצג לא פעילים ({inactiveCount})
          </label>
        )}
        <button
          type="button"
          onClick={() => setMode({ kind: 'add', seq: Date.now() })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
        >
          <Plus size={14} aria-hidden />
          מנוי חדש
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 me-1">הוסף מהר:</span>
        {QUICK_ADDS.map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => setMode({ kind: 'add', initial: q.draft, seq: Date.now() })}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
          >
            {q.label}
          </button>
        ))}
      </div>

      {mode.kind === 'add' && <ItemForm key={mode.seq} initial={mode.initial} today={today} onDone={done} onCancel={() => setMode({ kind: 'idle' })} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl px-4 py-6 text-center">
          עוד אין מנויים. התחילו מ&quot;הוסף מהר&quot; — Workspace, Apple Developer ו-Google Play כבר ממולאים.
        </p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {visible.map((i) =>
            mode.kind === 'edit' && mode.item.id === i.id ? (
              <li key={i.id} className="p-2">
                <ItemForm item={i} today={today} onDone={done} onCancel={() => setMode({ kind: 'idle' })} />
              </li>
            ) : (
              <li key={i.id} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${i.active ? '' : 'opacity-60'}`}>
                <span className="font-bold text-slate-900">{i.name}</span>
                <span className="text-xs text-slate-500">
                  {CATEGORY_HE[i.category]} · {CADENCE_HE[i.cadence]}
                  {i.vendor ? ` · ${i.vendor}` : ''}
                  {!i.active && i.endDate ? ` · הופסק ${i.endDate}` : ''}
                </span>
                <span className="ms-auto tabular-nums text-slate-800">{fmtMoney(i.amount, i.currency)}</span>
                <span className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setMode({ kind: 'edit', item: i })} className="text-sky-700 hover:underline underline-offset-2">עריכה</button>
                  <button
                    type="button"
                    disabled={busyId === i.id}
                    onClick={() => toggleActive(i)}
                    className="text-slate-600 hover:underline underline-offset-2 disabled:opacity-50"
                  >
                    {busyId === i.id ? <Loader2 size={12} className="animate-spin" /> : i.active ? 'הפסק' : 'החזר לפעיל'}
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
