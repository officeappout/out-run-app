'use client';

/**
 * HubBulkConfirm — "approve every pending X in <authority>" with the EXACT
 * count (owner decision 22.10.2026: bulk only inside one selected authority,
 * confirm names the number). A page modal: backdrop z-[80] / panel z-[81]
 * (the admin z-index budget's "page modals" row in .cursorrules).
 */
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export interface HubBulkConfirmProps {
  authorityName: string;
  label: string;
  count: number;
  /** The layer hit its cap (total features) — say so, never imply "all". */
  truncatedTotal: number | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function HubBulkConfirm({ authorityName, label, count, truncatedTotal, busy, onConfirm, onCancel }: HubBulkConfirmProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40" onClick={() => { if (!busy) onCancel(); }} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="hub-bulk-title" data-testid="hub-bulk-confirm" dir="rtl"
        className="fixed left-1/2 top-1/2 z-[81] w-[min(420px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl">
        <h3 id="hub-bulk-title" className="text-base font-black">לאשר {count} {label} ב{authorityName}?</h3>
        <p className="mt-2 text-sm text-slate-600">
          יאושרו בדיוק <b data-testid="hub-bulk-count">{count}</b> פריטים ממתינים, רק ברשות הזו. הפעולה זהה לאישור במרכז האישורים.
        </p>
        {truncatedTotal != null && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-sm font-bold text-amber-800">השכבה נחתכה ({truncatedTotal} פריטים בסך הכול) — יאושרו רק {count} הממתינים שנטענו, בלי לגעת בשאר.</p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={onConfirm} data-testid="hub-bulk-ok"
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} אשר {count}
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">ביטול</button>
        </div>
      </div>
    </>
  );
}
