'use client';

/**
 * FilteredBulkDialog — the approval center's "אשר מסוננים" / "דחה מסוננים"
 * (owner 24.10.2026). Shows the exact count and the filter summary, then runs
 * authority by authority (≤ 499 per call) through /api/admin/routes/review-bulk,
 * which re-checks ownership, pending, the filter and (approve) the straight-bridge
 * guard at write time — so the summary can report fewer than requested.
 * Page modal: backdrop z-[80] / panel z-[81] (.cursorrules page-modals row, same as HubBulkAllDialog).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { confirmPhrase, isConfirmValid, runBulkApprove, type ApproveBatchFn, type RunSummary } from '@/lib/city-mapping-hub/bulk-approve.logic';
import type { FilteredAction, FilteredActionPlan } from '@/lib/city-mapping-hub/review-filters';

export default function FilteredBulkDialog({
  action, plan, filterSummary, runBatch, onClose, onDone, requireTypedCount = false,
}: {
  action: FilteredAction;
  /** No review filter active → the whole queue is in play: require typing the exact count, as the hub dialog does. */
  requireTypedCount?: boolean;
  plan: FilteredActionPlan;
  filterSummary: string;
  runBatch: (authorityId: string, ids: string[], reason: string | null) => ReturnType<ApproveBatchFn>;
  onClose: () => void;
  onDone: (summary: RunSummary) => void;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const confirmed = !requireTypedCount || isConfirmValid(typed, plan.total);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const ran = useRef(false);
  const approve = action === 'approve';
  const verb = approve ? 'אשר' : 'דחה';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const run = useCallback(async () => {
    if (ran.current || plan.total === 0 || !confirmed) return;
    ran.current = true;
    setRunning(true);
    setProgress({ done: 0, total: plan.perAuthority.length });
    try {
      const r = reason.trim() || null;
      const s = await runBulkApprove(plan, (id, ids) => runBatch(id, ids, r), (done, total) => setProgress({ done, total }));
      setSummary(s);
      onDone(s);
    } finally {
      setRunning(false);
    }
  }, [plan, reason, runBatch, onDone, confirmed]);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40" onClick={() => { if (!running) onClose(); }} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="filtered-bulk-title" data-testid="filtered-bulk" dir="rtl"
        className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90vh] w-[min(560px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-5 shadow-2xl">
        <h3 id="filtered-bulk-title" className="text-base font-black">{approve ? 'אישור מסלולים מסוננים' : 'דחיית מסלולים מסוננים'}</h3>

        {!summary && (
          <>
            <p className="text-sm">
              {approve ? 'יאושרו' : 'יידחו'} <b data-testid="filtered-bulk-total">{plan.total}</b> מסלולים ב-{plan.perAuthority.length} רשויות.
            </p>
            <p className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700" data-testid="filtered-bulk-filters">סינון: {filterSummary}</p>
            {(plan.unattributed > 0 || plan.geometryExcluded > 0) && (
              <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                {plan.geometryExcluded > 0 && <p>⚠ {plan.geometryExcluded} מסלולים עם קפיצה ישרה חשודה / בלי נתיב מדיד לא יאושרו.</p>}
                {plan.unattributed > 0 && <p>⚠ {plan.unattributed} מסלולים ללא רשות מזוהה לא נכללים.</p>}
              </div>
            )}
            <p className="text-xs text-slate-500">
              השרת בודק שוב כל מסלול בזמן הכתיבה (עדיין ממתין, שייך לרשות, תואם לסינון{approve ? ', בלי קפיצה ישרה' : ''}) ומדלג על מה שלא עומד בזה.
              {approve ? ' האישור זהה לאישור במרכז האישורים (פרסום, שידור לסגמנטים, חישוב מחדש).' : ' דחייה = סטטוס "בארכיון" כמו דחייה רגילה, הפיכה.'}
            </p>
            {!approve && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                סיבה (אופציונלי, נרשמת לכל מסלול)
                <input className="rounded-lg border border-slate-200 px-2 py-1" value={reason} maxLength={500} disabled={running} onChange={(e) => setReason(e.target.value)} data-testid="filtered-bulk-reason" />
              </label>
            )}
            {requireTypedCount && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                <span>לא הוגדר סינון ציון / ביטחון / סוג רשות. להמשך הקלידו <code className="rounded bg-slate-100 px-1">{confirmPhrase(plan.total)}</code></span>
                <input className="rounded-lg border border-slate-200 px-2 py-1" value={typed} disabled={running || plan.total === 0} onChange={(e) => setTyped(e.target.value)} data-testid="filtered-bulk-typed" />
              </label>
            )}
            {progress && <p role="status" className="text-sm font-bold text-emerald-800">{approve ? 'מאשר' : 'דוחה'}… {progress.done} / {progress.total} רשויות</p>}
          </>
        )}

        {summary && (
          <div className="flex min-h-0 flex-col gap-2" data-testid="filtered-bulk-summary">
            <p className="text-sm font-bold">{approve ? 'אושרו' : 'נדחו'} {summary.approved} מתוך {summary.requested}{summary.skipped ? ` · דולגו ${summary.skipped} (לא עמדו בבדיקה החוזרת)` : ''}.</p>
            {summary.failedAuthorities.length > 0 && (
              <div role="alert" className="rounded-lg bg-red-50 px-2 py-1 text-sm text-red-700">
                נכשלו {summary.failedAuthorities.length} רשויות (מה שכבר נכתב נשאר; אפשר להריץ שוב בבטחה):
                <ul className="list-disc ps-5">{summary.failedAuthorities.map((r) => <li key={r.authorityId}>{r.name}: {r.error}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!summary && (
            <button type="button" disabled={running || plan.total === 0 || !confirmed} onClick={run} data-testid="filtered-bulk-ok"
              className={`inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${approve ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {running && <Loader2 className="h-4 w-4 animate-spin" />} {verb} {plan.total}
            </button>
          )}
          <button type="button" disabled={running} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">{summary ? 'סגור' : 'ביטול'}</button>
        </div>
      </div>
    </>
  );
}
