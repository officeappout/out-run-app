'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CADENCES, COST_CATEGORIES, CURRENCIES, type CostItem, type VendorKey } from '@/lib/costs/cost-types';
import type { CostItemInput } from '@/lib/costs/item-schema';
import { VENDOR_LABEL_HE } from '@/lib/costs/connector-meta';
import { CADENCE_HE, CATEGORY_HE, costsFetch, readError } from './costs-client';

type Draft = { [K in keyof CostItemInput]?: CostItemInput[K] } & { amountText?: string };

const FIELD = 'w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

function fromItem(i: CostItem): Draft {
  return {
    name: i.name, vendor: i.vendor, vendorKey: i.vendorKey ?? null, amountText: String(i.amount), currency: i.currency,
    cadence: i.cadence, startDate: i.startDate, renewalDate: i.renewalDate ?? null, category: i.category, notes: i.notes ?? '',
  };
}

/** Add (no `item`) or edit an item. Inline panel — no modal. */
export default function ItemForm({
  item, initial, today, onDone, onCancel,
}: { item?: CostItem; initial?: Partial<CostItemInput>; today: string; onDone: () => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(() =>
    item ? fromItem(item) : { currency: 'USD', cadence: 'monthly', category: 'tools', startDate: today, ...initial, amountText: initial?.amount ? String(initial.amount) : '' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(d.amountText);
    if (!d.name?.trim()) return setError('חסר שם');
    if (!(amount > 0)) return setError('סכום חייב להיות גדול מ-0');
    const body: CostItemInput = {
      name: d.name.trim(),
      vendor: (d.vendor ?? '').trim(),
      vendorKey: d.vendorKey ?? null,
      amount,
      currency: d.currency!,
      cadence: d.cadence!,
      startDate: d.startDate!,
      renewalDate: d.cadence === 'yearly' && d.renewalDate ? d.renewalDate : null,
      category: d.category!,
      notes: d.notes ?? '',
    };
    setBusy(true);
    setError(null);
    try {
      const res = await costsFetch(item ? `/api/admin/costs/items/${item.id}` : '/api/admin/costs/items', {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
      <label className="col-span-2 text-xs text-slate-600 space-y-1">
        <span>שם</span>
        <input className={FIELD} value={d.name ?? ''} onChange={(e) => set('name', e.target.value)} required maxLength={80} />
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>ספק</span>
        <input className={FIELD} value={d.vendor ?? ''} onChange={(e) => set('vendor', e.target.value)} maxLength={80} />
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>קטגוריה</span>
        <select className={FIELD} value={d.category} onChange={(e) => set('category', e.target.value as Draft['category'])}>
          {COST_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_HE[c]}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>סכום</span>
        <input className={`${FIELD} tabular-nums`} inputMode="decimal" dir="ltr" value={d.amountText ?? ''} onChange={(e) => set('amountText', e.target.value)} required />
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>מטבע</span>
        <select className={FIELD} value={d.currency} onChange={(e) => set('currency', e.target.value as Draft['currency'])}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c === 'ILS' ? '₪ ILS' : c === 'USD' ? '$ USD' : '€ EUR'}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>תדירות</span>
        <select className={FIELD} value={d.cadence} onChange={(e) => set('cadence', e.target.value as Draft['cadence'])}>
          {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_HE[c]}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-600 space-y-1">
        <span>{d.cadence === 'one_off' ? 'תאריך החיוב' : 'תאריך התחלה'}</span>
        <input type="date" className={FIELD} value={d.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} required />
      </label>
      {d.cadence === 'yearly' && (
        <label className="text-xs text-slate-600 space-y-1">
          <span>תאריך חידוש (אם שונה)</span>
          <input type="date" className={FIELD} value={d.renewalDate ?? ''} onChange={(e) => set('renewalDate', e.target.value || null)} />
        </label>
      )}
      <label className="text-xs text-slate-600 space-y-1">
        <span>מכוסה ע״י מחבר</span>
        <select className={FIELD} value={d.vendorKey ?? ''} onChange={(e) => set('vendorKey', (e.target.value || null) as VendorKey | null)}>
          <option value="">לא</option>
          {(Object.keys(VENDOR_LABEL_HE) as VendorKey[]).map((v) => <option key={v} value={v}>{VENDOR_LABEL_HE[v]}</option>)}
        </select>
      </label>
      <label className="col-span-2 md:col-span-4 text-xs text-slate-600 space-y-1">
        <span>הערות</span>
        <input className={FIELD} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
      </label>
      <div className="col-span-2 md:col-span-4 flex items-center gap-3">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}
          {item ? 'שמור שינויים' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-600 hover:underline underline-offset-2">ביטול</button>
        {d.vendorKey && <p className="text-[11px] text-slate-500">בחודש שבו המחבר מדווח, הפריט מוצג אך לא נספר שוב.</p>}
        {error && <p className="text-xs text-red-600 ms-auto">{error}</p>}
      </div>
    </form>
  );
}
